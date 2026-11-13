import type { ActionFunctionArgs } from "react-router";
import { jsonError } from "~/server/errors";
import { callProcedure } from "~/server/rpc/index.server";
import { assertSameOrigin, ensureBootstrap, requireUser } from "~/server/session.server";

/** POST /api/rpc/:name — every dashboard read and write goes through here. */
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    assertSameOrigin(request);
    await ensureBootstrap();
    const user = await requireUser(request);
    const input = await request.json().catch(() => ({}));
    const data = await callProcedure(params.name ?? "", { user, request }, input);
    return Response.json({ ok: true, data: data ?? null });
  } catch (error) {
    return jsonError(error);
  }
}
