import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import type { Staff } from "~/lib/types";
import { logActivity } from "~/server/activity.server";
import { db } from "~/server/db.server";
import { badRequest, HttpError, jsonError } from "~/server/errors";
import {
  assertSameOrigin,
  clientIp,
  createStaffAccount,
  ensureBootstrap,
  getUser,
  sessionCookie,
  throttle,
} from "~/server/session.server";
import { getStore } from "~/server/store/index.server";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(1).max(128),
});
const setup = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

const needsSetup = async () => (await getStore().list("staff", { limit: 1 })).length === 0;

/** GET /api/session — who am I, and does the first administrator still need to be created? */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await ensureBootstrap();
    const user = await getUser(request);
    return Response.json({ ok: true, data: { user, needsSetup: user ? false : await needsSetup() } });
  } catch (error) {
    return jsonError(error);
  }
}

/** POST = sign in (or first-run setup with { setup: true }); DELETE = sign out. */
export async function action({ request }: ActionFunctionArgs) {
  try {
    assertSameOrigin(request);
    if (request.method === "DELETE") {
      return Response.json({ ok: true, data: null }, { headers: { "Set-Cookie": sessionCookie(null) } });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    await ensureBootstrap();
    const body = await request.json().catch(() => ({}));

    if (body?.setup === true) {
      // Only possible while no employee exists at all.
      if (!(await needsSetup())) {
        throw new HttpError(409, "already_set_up", "This workspace already has an administrator");
      }
      const parsed = setup.safeParse(body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw badRequest(issue?.message ?? "Invalid input", { field: issue?.path[0] ?? null });
      }
      const admin = await createStaffAccount({ ...parsed.data, role: "admin" });
      return Response.json(
        { ok: true, data: { user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } } },
        { headers: { "Set-Cookie": sessionCookie(admin.id) } },
      );
    }

    const parsed = credentials.safeParse(body);
    if (!parsed.success) throw new HttpError(401, "invalid_credentials", "Incorrect email or password");
    throttle(`login:${clientIp(request)}:${parsed.data.email}`, 8, 5 * 60_000);

    const userId = await getStore().auth.verify(parsed.data.email, parsed.data.password);
    const staff = userId ? await db.get<Staff>("staff", userId) : null;
    // Same answer for unknown email, wrong password and deactivated account.
    if (!staff || !staff.isActive) throw new HttpError(401, "invalid_credentials", "Incorrect email or password");

    await db.update("staff", staff.id, { lastLoginAt: new Date().toISOString() });
    const user = { id: staff.id, name: staff.name, email: staff.email, role: staff.role };
    await logActivity({
      actor: user,
      action: "login",
      entityType: "staff",
      entityId: staff.id,
      description: `${staff.name} signed in`,
    });
    return Response.json({ ok: true, data: { user } }, { headers: { "Set-Cookie": sessionCookie(staff.id) } });
  } catch (error) {
    return jsonError(error);
  }
}
