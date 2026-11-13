import { ROLES, type Role } from "~/lib/constants";
import { publish, type Audience, type ChangeEvent } from "./events.server";
import { getStore } from "./store/index.server";
import type { Collection } from "./store/schema";
import type { ListOptions } from "./store/types";

/**
 * Data access used by all server code: the configured store plus change
 * publication. Reads and writes are identical for every storage driver.
 */

const EVERYONE: Role[] = [...ROLES];
const LEADERS: Role[] = ["admin", "manager"];

type Doc = { id: string };
const field = (doc: Doc, key: string) => (doc as unknown as Record<string, unknown>)[key];

/** Who may receive a change to this record over the live feed. */
function audienceFor(collection: Collection, doc: Doc, extraUserIds: string[] = []): Audience | null {
  switch (collection) {
    case "staff":
    case "packages":
    case "departures":
    case "settings":
      return { roles: EVERYONE, userIds: [] };
    case "leads":
    case "bookings":
    case "pilgrims":
    case "followups":
      return { roles: LEADERS, userIds: field(doc, "assignedTo") ? [String(field(doc, "assignedTo"))] : [] };
    case "messages":
      return { roles: LEADERS, userIds: extraUserIds };
    case "activity":
      return { roles: LEADERS, userIds: (field(doc, "visibleTo") as string[] | undefined) ?? [] };
    case "integration":
      return { roles: ["admin"], userIds: [] };
    default:
      return null; // webhook_events are never streamed
  }
}

interface WriteOptions {
  /** Additional recipients (e.g. the agent assigned to a message's lead). */
  userIds?: string[];
  notify?: ChangeEvent["notify"];
  silent?: boolean;
}

export const db = {
  get kind() {
    return getStore().kind;
  },
  get: <T>(collection: Collection, id: string) => getStore().get<T>(collection, id),
  list: <T>(collection: Collection, options?: ListOptions) => getStore().list<T>(collection, options),

  async create<T extends Doc>(
    collection: Collection,
    data: Record<string, unknown>,
    options: WriteOptions & { id?: string } = {},
  ): Promise<T> {
    const doc = await getStore().create<T>(collection, data, options.id);
    await emit(collection, "upsert", doc, options);
    return doc;
  },

  async update<T extends Doc>(
    collection: Collection,
    id: string,
    patch: Record<string, unknown>,
    options: WriteOptions & { previousAssignee?: string | null } = {},
  ): Promise<T> {
    const doc = await getStore().update<T>(collection, id, patch);
    const previous = options.previousAssignee;
    if (previous && previous !== field(doc, "assignedTo") && !options.silent) {
      // The record left this agent's scope: remove it from their screen.
      await publish({ collection, op: "delete", doc: { id }, audience: { roles: [], userIds: [previous] } });
    }
    await emit(collection, "upsert", doc, options);
    return doc;
  },

  async remove(collection: Collection, doc: Doc, options: WriteOptions = {}): Promise<void> {
    await getStore().remove(collection, doc.id);
    await emit(collection, "delete", doc, options);
  },
};

async function emit(collection: Collection, op: ChangeEvent["op"], doc: Doc, options: WriteOptions): Promise<void> {
  if (options.silent) return;
  const audience = audienceFor(collection, doc, options.userIds);
  if (!audience) return;
  await publish({
    collection,
    op,
    doc: op === "delete" ? { id: doc.id } : (doc as ChangeEvent["doc"]),
    audience,
    notify: options.notify,
  });
}
