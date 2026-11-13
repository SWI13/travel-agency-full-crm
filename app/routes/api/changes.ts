import type { LoaderFunctionArgs } from "react-router";
import { changesSince, liveMode } from "~/server/events.server";
import { jsonError } from "~/server/errors";
import { requireUser } from "~/server/session.server";

/**
 * GET /api/changes?since=<revision> — live updates for serverless hosting
 * (Redis). The dashboard calls it every few seconds while it is visible.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const user = await requireUser(request);
    if (liveMode() !== "poll") return Response.json({ rev: 0, events: [], resync: false, mode: "stream" });
    const since = Math.max(0, Number(new URL(request.url).searchParams.get("since") ?? 0) || 0);
    const result = await changesSince(user, since);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
