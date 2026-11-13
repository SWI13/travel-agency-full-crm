import type { ActionFunctionArgs } from "react-router";
import { badRequest, jsonError } from "~/server/errors";
import { MAX_UPLOAD_BYTES, saveImage } from "~/server/media.server";
import { assertSameOrigin, requireCap, requireUser, throttle } from "~/server/session.server";

/**
 * POST /api/upload — a package photo, sent as the raw request body
 * (the dashboard resizes it in the browser first). Returns { url }.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    assertSameOrigin(request);
    const user = await requireUser(request);
    requireCap(user, "catalog.manage");
    await throttle(`upload:${user.id}`, 60, 10 * 60_000);
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES) throw badRequest("Image too large (max 3 MB)", { field: "file" });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const url = await saveImage(bytes);
    return Response.json({ ok: true, data: { url } });
  } catch (error) {
    return jsonError(error);
  }
}
