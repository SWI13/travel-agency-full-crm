import type { ActivityAction } from "~/lib/constants";
import type { Activity, Lead, SessionUser } from "~/lib/types";
import { db } from "./db.server";

export const SYSTEM_ACTOR = { id: null, name: "System", type: "system" as const };

interface LogInput {
  actor: SessionUser | typeof SYSTEM_ACTOR;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  lead?: Pick<Lead, "id" | "assignedTo" | "isDemo"> | null;
  description: string;
  meta?: Record<string, unknown>;
  isDemo?: boolean;
  /** Extra agents who may see this entry. */
  visibleTo?: string[];
}

/**
 * Appends an audit entry. Entries are written by the server only; there is no
 * endpoint that edits or deletes them.
 * Logging must never break the business operation it describes.
 */
export async function logActivity(input: LogInput): Promise<void> {
  const actorId = "role" in input.actor ? input.actor.id : null;
  const visibleTo = new Set<string>(input.visibleTo ?? []);
  if (actorId) visibleTo.add(actorId);
  if (input.lead?.assignedTo) visibleTo.add(input.lead.assignedTo);
  try {
    await db.create<Activity>("activity", {
      actorId,
      actorName: input.actor.name,
      actorType: "role" in input.actor ? "user" : "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? input.lead?.id ?? null,
      leadId: input.lead?.id ?? null,
      description: input.description.slice(0, 600),
      meta: input.meta ?? {},
      visibleTo: [...visibleTo],
      isDemo: input.isDemo ?? input.lead?.isDemo ?? false,
    });
  } catch (error) {
    console.error("[activity] Could not write audit entry:", error instanceof Error ? error.message : error);
  }
}
