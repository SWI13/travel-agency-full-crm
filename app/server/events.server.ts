import type { Role } from "~/lib/constants";
import type { SessionUser } from "~/lib/types";

/**
 * In-process change feed. Every write performed by the server is published here
 * and streamed to connected dashboards over Server-Sent Events (/api/events),
 * filtered per user so nobody receives records they may not read.
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

type Listener = { user: SessionUser; send: (event: Omit<ChangeEvent, "audience">) => void };

const holder = globalThis as unknown as { __crmListeners?: Set<Listener> };
const listeners = (holder.__crmListeners ??= new Set<Listener>());

export function subscribe(user: SessionUser, send: Listener["send"]): () => void {
  const listener: Listener = { user, send };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(event: ChangeEvent): void {
  const { audience, ...payload } = event;
  for (const listener of listeners) {
    const allowed =
      audience.roles.includes(listener.user.role) || audience.userIds.includes(listener.user.id);
    if (!allowed) continue;
    try {
      listener.send(payload);
    } catch {
      listeners.delete(listener);
    }
  }
}

export const connectedClients = () => listeners.size;
