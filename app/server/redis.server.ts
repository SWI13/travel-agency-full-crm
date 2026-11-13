import { createClient } from "redis";

/**
 * Shared Redis connection (Vercel Redis / Upstash, Redis Cloud, or any Redis).
 * Enabled by REDIS_URL — or KV_URL, the name Vercel's Upstash integration uses.
 * One connection per server instance, reused across requests and dev reloads.
 */

export function redisUrl(): string {
  return (process.env.REDIS_URL ?? process.env.KV_URL ?? "").trim();
}
export const redisConfigured = () => Boolean(redisUrl());

/** Prefix for every key, so several apps can share one database. */
export const KEY_PREFIX = ((process.env.REDIS_PREFIX ?? "").trim() || "crm") + ":";

function makeClient() {
  const client = createClient({
    url: redisUrl(),
    socket: { connectTimeout: 10_000, reconnectStrategy: (retries) => Math.min(retries * 200, 3_000) },
  });
  client.on("error", (error) => console.error("[redis]", error instanceof Error ? error.message : error));
  return client;
}
type Client = ReturnType<typeof makeClient>;
const holder = globalThis as unknown as { __crmRedis?: Promise<Client> };

export function redis(): Promise<Client> {
  if (!holder.__crmRedis) {
    const pending = (async () => {
      const client = makeClient();
      await client.connect();
      return client;
    })();
    pending.catch(() => {
      if (holder.__crmRedis === pending) holder.__crmRedis = undefined; // try again on the next request
    });
    holder.__crmRedis = pending;
  }
  return holder.__crmRedis;
}

/** Runs a Lua script (scripts are small, sent with every call — no cache to manage). */
export async function evalScript(script: string, keys: string[], args: string[]): Promise<unknown> {
  const client = await redis();
  return client.eval(script, { keys, arguments: args });
}
