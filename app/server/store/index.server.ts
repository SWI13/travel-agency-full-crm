import { appwriteConfigured } from "../env.server";
import { createAppwriteStore } from "./appwrite.server";
import { createLocalStore } from "./local.server";
import { createRedisStore } from "./redis.server";
import { redisConfigured } from "../redis.server";
import type { Store } from "./types";

// One store per process, surviving dev-server module reloads.
const holder = globalThis as unknown as { __crmStore?: Store };

export function getStore(): Store {
  // Appwrite when configured, else Redis (Vercel), else the local demo file.
  holder.__crmStore ??= appwriteConfigured() ? createAppwriteStore() : redisConfigured() ? createRedisStore() : createLocalStore();
  return holder.__crmStore;
}

export { ConflictError, NotFoundError } from "./types";
export type { Store, StoreKind } from "./types";
