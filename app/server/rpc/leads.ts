import { z } from "zod";
import {
  FOLLOWUP_REASONS,
  LEAD_STAGES,
  PRIORITIES,
  ROOM_TYPES,
  SERVICE_TYPES,
} from "~/lib/constants";
import { can } from "~/lib/permissions";
import { normalizeDzPhone } from "~/lib/phone";
import type { Booking, FollowUp, Lead, Message, Package, Staff } from "~/lib/types";
import { logActivity } from "../activity.server";
import { db } from "../db.server";
import { badRequest, forbidden, HttpError, notFound } from "../errors";
import { reassignLeadChildren, syncNextFollowUp, upsertLeadFromInquiry } from "../leads.server";
import { getSettings } from "../session.server";
import { leadFor, rpc, zCount, zDay, zId, zIsoDate, zMoney, zNullableText, zText } from "./core";

const leadPatch = z
  .object({
    displayName: zNullableText(160),
    serviceType: z.enum(SERVICE_TYPES),
    stage: z.enum(LEAD_STAGES),
    priority: z.enum(PRIORITIES),
    assignedTo: zId.nullable(),
    packageId: zId.nullable(),
    departureCity: zNullableText(80),
    departureDate: zDay,
    returnDate: zDay,
    adults: zCount.nullable(),
    children: zCount.nullable(),
    roomPreference: z.enum(ROOM_TYPES).nullable(),
    budgetDzd: zMoney.nullable(),
    notes: zNullableText(5000),
    tags: z.array(zText(40).min(1)).max(20),
    lostReason: zNullableText(300),
  })
  .partial();

async function activeStaff(id: string): Promise<Staff> {
  const staff = await db.get<Staff>("staff", id);
  if (!staff || !staff.isActive) throw badRequest("The selected employee is not active");
  return staff;
}

export const leadProcedures = {
  "leads.update": rpc({
    input: z.object({ id: zId, patch: leadPatch }),
    async run({ user }, { id, patch }) {
      const lead = await leadFor(user, id);
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        const current = (lead as unknown as Record<string, unknown>)[key];
        if (JSON.stringify(current ?? null) !== JSON.stringify(value ?? null)) changes[key] = value;
      }
      if (!Object.keys(changes).length) return lead;

      let assignee: Staff | null = null;
      if ("assignedTo" in changes) {
        if (!can(user.role, "leads.assign")) throw forbidden("Only managers can assign leads");
        if (changes.assignedTo) assignee = await activeStaff(changes.assignedTo as string);
      }
      let pkg: Package | null = null;
      if (changes.packageId) {
        pkg = await db.get<Package>("packages", changes.packageId as string);
        if (!pkg) throw notFound("Package");
      }
      if (changes.stage === "lost" && !(patch.lostReason ?? lead.lostReason)) {
        throw badRequest("Please give the reason this lead was lost", { field: "lostReason" });
      }

      changes.lastActivityAt = new Date().toISOString();
      const updated = await db.update<Lead>("leads", id, changes, { previousAssignee: lead.assignedTo });

      if ("assignedTo" in changes) {
        await reassignLeadChildren(updated, lead.assignedTo);
        await logActivity({
          actor: user,
          action: "lead_assigned",
          entityType: "lead",
          lead: updated,
          description: assignee ? `Lead assigned to ${assignee.name}` : "Lead unassigned",
          meta: { from: lead.assignedTo, to: assignee?.id ?? null, toName: assignee?.name ?? null },
          visibleTo: lead.assignedTo ? [lead.assignedTo] : [],
        });
      }
      if ("stage" in changes) {
        await logActivity({
          actor: user,
          action: "stage_changed",
          entityType: "lead",
          lead: updated,
          description: `Stage changed from ${lead.stage} to ${updated.stage}`,
          meta: { from: lead.stage, to: updated.stage, lostReason: updated.stage === "lost" ? updated.lostReason : null },
        });
      }
      if (pkg) {
        await logActivity({
          actor: user,
          action: "package_selected",
          entityType: "lead",
          lead: updated,
          description: `Preferred package set to ${pkg.name}`,
          meta: { packageId: pkg.id, packageName: pkg.name },
        });
      }
      const other = Object.keys(changes).filter(
        (k) => !["assignedTo", "stage", "packageId", "lastActivityAt"].includes(k),
      );
      if (other.length) {
        await logActivity({
          actor: user,
          action: "lead_updated",
          entityType: "lead",
          lead: updated,
          description: `Lead details updated (${other.join(", ")})`,
          meta: { fields: other },
        });
      }
      return updated;
    },
  }),

  "leads.markRead": rpc({
    input: z.object({ id: zId }),
    async run({ user }, { id }) {
      const lead = await leadFor(user, id);
      if (lead.unreadCount === 0) return lead;
      return db.update<Lead>("leads", id, { unreadCount: 0 });
    },
  }),

  "leads.create": rpc({
    cap: "leads.create",
    input: z.object({
      phone: zText(30).min(6),
      name: zNullableText(160).optional(),
      serviceType: z.enum(SERVICE_TYPES).default("unknown"),
      note: zNullableText(1000).optional(),
      assignedTo: zId.nullable().optional(),
    }),
    async run({ user }, input) {
      const phone = normalizeDzPhone(input.phone);
      if (!phone) throw badRequest("Enter a valid phone number", { field: "phone" });
      const existing = await db.list<Lead>("leads", { where: { phone }, limit: 1 });
      if (existing[0]) {
        throw new HttpError(409, "lead_exists", "A lead with this phone number already exists", { id: existing[0].id });
      }
      // Agents keep what they create; managers may assign to anyone or leave it open.
      const assignedTo = can(user.role, "leads.assign") ? (input.assignedTo ?? null) : user.id;
      if (assignedTo) await activeStaff(assignedTo);
      const { lead } = await upsertLeadFromInquiry({
        phone,
        name: input.name ?? null,
        source: "manual",
        serviceType: input.serviceType,
        assignedTo,
        actor: user,
        settings: { ...(await getSettings()), autoAssign: "off" },
      });
      return input.note ? db.update<Lead>("leads", lead.id, { notes: input.note }) : lead;
    },
  }),

  "leads.delete": rpc({
    cap: "leads.delete",
    input: z.object({ id: zId }),
    async run({ user }, { id }) {
      const lead = await leadFor(user, id);
      const bookings = await db.list<Booking>("bookings", { where: { leadId: id }, limit: 1 });
      if (bookings.length) {
        throw new HttpError(409, "lead_has_bookings", "This lead has bookings and cannot be deleted");
      }
      for (const m of await db.list<Message>("messages", { where: { leadId: id } })) {
        await db.remove("messages", m, { silent: true });
      }
      for (const f of await db.list<FollowUp>("followups", { where: { leadId: id } })) await db.remove("followups", f);
      await db.remove("leads", lead);
      await logActivity({
        actor: user,
        action: "lead_updated",
        entityType: "lead",
        entityId: id,
        description: "Lead deleted",
        meta: { deleted: true },
        isDemo: lead.isDemo,
      });
      return { ok: true };
    },
  }),

  "messages.list": rpc({
    input: z.object({ leadId: zId }),
    async run({ user }, { leadId }) {
      await leadFor(user, leadId);
      const messages = await db.list<Message>("messages", { where: { leadId }, orderBy: "timestamp" });
      return messages.filter((m) => m.processed);
    },
  }),

  // ── Follow-ups ────────────────────────────────────────────────────────────
  "followups.create": rpc({
    input: z.object({
      leadId: zId,
      dueAt: zIsoDate,
      reason: z.enum(FOLLOWUP_REASONS),
      notes: zNullableText(1000).optional(),
      assignedTo: zId.nullable().optional(),
    }),
    async run({ user }, input) {
      const lead = await leadFor(user, input.leadId);
      let assignedTo = input.assignedTo ?? lead.assignedTo ?? user.id;
      if (!can(user.role, "leads.assign")) assignedTo = user.id;
      const assignee = await activeStaff(assignedTo);
      const followUp = await db.create<FollowUp>("followups", {
        leadId: lead.id,
        dueAt: new Date(input.dueAt).toISOString(),
        assignedTo,
        reason: input.reason,
        notes: input.notes ?? null,
        status: "pending",
        completedAt: null,
        completedBy: null,
        createdBy: user.id,
        isDemo: lead.isDemo,
      });
      await syncNextFollowUp(lead);
      await logActivity({
        actor: user,
        action: "followup_scheduled",
        entityType: "followup",
        entityId: followUp.id,
        lead,
        description: `Follow-up scheduled for ${assignee.name}`,
        meta: { dueAt: followUp.dueAt, reason: followUp.reason, assigneeName: assignee.name },
        visibleTo: [assignedTo],
      });
      return followUp;
    },
  }),

  "followups.update": rpc({
    input: z.object({
      id: zId,
      dueAt: zIsoDate.optional(),
      reason: z.enum(FOLLOWUP_REASONS).optional(),
      notes: zNullableText(1000).optional(),
      done: z.boolean().optional(),
    }),
    async run({ user }, input) {
      const followUp = await db.get<FollowUp>("followups", input.id);
      if (!followUp) throw notFound("Follow-up");
      if (!can(user.role, "leads.view_all") && followUp.assignedTo !== user.id) {
        throw forbidden("This follow-up is not assigned to you");
      }
      const lead = await db.get<Lead>("leads", followUp.leadId);
      const patch: Record<string, unknown> = {};
      if (input.dueAt) patch.dueAt = new Date(input.dueAt).toISOString();
      if (input.reason) patch.reason = input.reason;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.done !== undefined) {
        patch.status = input.done ? "done" : "pending";
        patch.completedAt = input.done ? new Date().toISOString() : null;
        patch.completedBy = input.done ? user.id : null;
      }
      const updated = await db.update<FollowUp>("followups", input.id, patch);
      if (lead) await syncNextFollowUp(lead);
      const completed = input.done === true;
      const rescheduled = !completed && input.dueAt && patch.dueAt !== followUp.dueAt;
      if (completed || rescheduled || input.done === false) {
        await logActivity({
          actor: user,
          action: completed ? "followup_completed" : "followup_rescheduled",
          entityType: "followup",
          entityId: updated.id,
          lead,
          description: completed
            ? "Follow-up completed"
            : rescheduled
              ? "Follow-up rescheduled"
              : "Follow-up reopened",
          meta: { dueAt: updated.dueAt, reason: updated.reason, reopened: input.done === false },
        });
      }
      return updated;
    },
  }),

  "followups.delete": rpc({
    input: z.object({ id: zId }),
    async run({ user }, { id }) {
      const followUp = await db.get<FollowUp>("followups", id);
      if (!followUp) throw notFound("Follow-up");
      if (!can(user.role, "leads.view_all") && followUp.assignedTo !== user.id) {
        throw forbidden("This follow-up is not assigned to you");
      }
      await db.remove("followups", followUp);
      const lead = await db.get<Lead>("leads", followUp.leadId);
      if (lead) await syncNextFollowUp(lead);
      return { ok: true };
    },
  }),
};
