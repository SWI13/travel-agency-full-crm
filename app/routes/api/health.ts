import { getStore } from "~/server/store/index.server";

/** GET /api/health — liveness and database reachability (no secrets, no data). */
export async function loader() {
  const store = getStore();
  const health = await store.health();
  return Response.json({ ok: health.ok, driver: store.kind }, { status: health.ok ? 200 : 503 });
}
