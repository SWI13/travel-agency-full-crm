import { appwriteConfigured } from "../env.server";
import { createAppwriteStore } from "./appwrite.server";
import { createLocalStore } from "./local.server";
import type { Store } from "./types";

// One store per process, surviving dev-server module reloads.
const holder = globalThis as unknown as { __crmStore?: Store };

export function getStore(): Store {
  holder.__crmStore ??= appwriteConfigured() ? createAppwriteStore() : createLocalStore();
  return holder.__crmStore;
}

export { ConflictError, NotFoundError } from "./types";
export type { Store } from "./types";
