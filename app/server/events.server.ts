import type { Role } from "~/lib/constants";
import type { SessionUser } from "~/lib/types";
import { evalScript, KEY_PREFIX, redis, redisConfigured } from "./redis.server";

/**
 * Change feed. Every write performed by the server is published here.
 *
 *  - One server process (local, Docker, Railway…): delivered instantly to the
 *    connected dashboards over Server-Sent Events (/api/events).
 *  - Serverless (Vercel, with Redis): instances do not share memory, so each
 *    change is also appended to a short log in Redis with a revision number.
 *    Dashboards ask for "everything after revision N" every few seconds
 *    (/api/changes) — one tiny Redis read when nothing changed.
 *
 * Either way, events are filtered per user so nobody receives records they may not read.
 */

export interface Audience {
  roles: Role[];
  userIds: string[];
}

export interface ChangeEvent {
  collection: string;
  op: "upsert" | "delete";
  doc: { id: string } & Record<string, unknown>;
  audience: Audience;
  /** Set for events that should ring/notify (new lead, new inbound message). */
  notify?: "new_lead" | "new_message";
}
export type ClientEvent = Omit<ChangeEvent, "audience">;

type Listener = { user: SessionUser; send: (event: ClientEvent) => void };

const holder = globalThis as unknown as { __crmListeners?: Set<Listener> };
const listeners = (holder.__crmListeners ??= new Set<Listener>());

/** "stream" = Server-Sent Events from this process; "poll" = shared log in Redis. */
export const liveMode = (): "stream" | "poll" => (redisConfigured() ? "poll" : "stream");

export function subscribe(user: SessionUser, send: Listener["send"]): () => void {
  const listener: Listener = { user, send };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const allowed = (audience: Audience, user: SessionUser) =>
  audience.roles.includes(user.role) || audience.userIds.includes(user.id);

const REV = `${KEY_PREFIX}feed:rev`;
const LOG = `${KEY_PREFIX}feed:log`;
const LOG_SIZE = 1000;
const APPEND = `
local rev = redis.call('INCR', KEYS[1])
redis.call('LPUSH', KEYS[2], rev .. '|' .. ARGV[1])
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[2]) - 1)
return rev
`;

export async function publish(event: ChangeEvent): Promise<void> {
  const { audience, ...payload } = event;
  for (const listener of listeners) {
    if (!allowed(audience, listener.user)) continue;
    try {
      listener.send(payload);
    } catch {
      listeners.delete(listener);
    }
  }
  if (redisConfigured()) {
    try {
      await evalScript(APPEND, [REV, LOG], [JSON.stringify(event), String(LOG_SIZE)]);
    } catch (error) {
      // The write itself succeeded; dashboards catch up on their next full refresh.
      console.error("[feed] could not record change", error instanceof Error ? error.message : error);
    }
  }
}

/** Current revision of the shared log (0 when Redis is not used). */
export async function currentRevision(): Promise<number> {
  if (!redisConfigured()) return 0;
  return Number((await (await redis()).get(REV)) ?? 0);
}

/**
 * Changes after `since` that this user may see. `resync` asks the dashboard to
 * reload everything (it was away longer than the log keeps).
 */
export async function changesSince(
  user: SessionUser,
  since: number,
): Promise<{ rev: number; events: ClientEvent[]; resync: boolean }> {
  const client = await redis();
  const rev = Number((await client.get(REV)) ?? 0);
  if (rev <= since) return { rev, events: [], resync: rev < since };
  // A few extra entries absorb changes written between the two reads.
  const entries = await client.lRange(LOG, 0, Math.min(LOG_SIZE, rev - since + 50) - 1);
  const parsed: Array<{ rev: number; event: ChangeEvent }> = [];
  for (const entry of entries) {
    const bar = entry.indexOf("|");
    const entryRev = Number(entry.slice(0, bar));
    if (entryRev <= since || entryRev > rev) continue;
    try {
      parsed.push({ rev: entryRev, event: JSON.parse(entry.slice(bar + 1)) as ChangeEvent });
    } catch {
      /* skip a damaged entry */
    }
  }
  parsed.sort((a, b) => a.rev - b.rev);
  const oldest = parsed[0]?.rev ?? rev;
  const resync = rev - since > LOG_SIZE || oldest > since + 1;
  const events = parsed
    .filter((p) => allowed(p.event.audience, user))
    .map(({ event }) => {
      const { audience: _audience, ...rest } = event;
      return rest;
    });
  return { rev, events, resync };
}

export const connectedClients = () => listeners.size;
