import { z } from "zod";
import { loginToEmail } from "~/lib/login";
import { LOCALES, ROLES } from "~/lib/constants";
import type { Activity, Settings, Staff } from "~/lib/types";
import { logActivity } from "../activity.server";
import { db } from "../db.server";
import { clearDemoData, demoSeedLoaded, hasDemoData, loadDemoData } from "../demo-data.server";
import { env } from "../env.server";
import { badRequest, forbidden, HttpError, notFound } from "../errors";
import { createStaffAccount, getSettings } from "../session.server";
import { ConflictError, getStore } from "../store/index.server";
import { runScenario, SCENARIOS } from "../whatsapp/simulate.server";
import { integrationStatus, testConnection } from "../whatsapp/status.server";
import { rpc, zId, zNullableText, zText } from "./core";

const zPassword = z.string().min(10, "Use at least 10 characters").max(128);
const zEmail = z.string().trim().toLowerCase().email().max(190);

async function assertAnotherAdmin(exceptId: string) {
  const admins = (await db.list<Staff>("staff", { where: { role: "admin" } })).filter((s) => s.isActive && s.id !== exceptId);
  if (!admins.length) throw new HttpError(409, "last_admin", "At least one active administrator is required");
}

function requireDemoTools() {
  if (!env.demoTools) throw forbidden("Demo tools are disabled on this server");
}

export const adminProcedures = {
  // ── Team ──────────────────────────────────────────────────────────────────
  "team.create": rpc({
    cap: "team.manage",
    input: z.object({
      name: zText(120).min(2),
      username: z.string().max(190).optional(),
      email: z.string().max(190).optional(),
      password: zPassword,
      role: z.enum(ROLES),
    }),
    async run({ user }, input) {
      const email = loginToEmail(input.username ?? input.email);
      if (!email) throw badRequest("Choose a username: letters, numbers, dot, dash (2-32 characters)", { field: "username" });
      try {
        const staff = await createStaffAccount({ name: input.name, email, password: input.password, role: input.role });
        await logActivity({
          actor: user,
          action: "staff_created",
          entityType: "staff",
          entityId: staff.id,
          description: `Employee ${staff.name} added as ${staff.role}`,
          meta: { name: staff.name, role: staff.role },
        });
        return staff;
      } catch (error) {
        if (error instanceof ConflictError) {
          throw new HttpError(409, "email_taken", "This username is already used by another employee", { field: "username" });
        }
        throw error;
      }
    },
  }),

  "team.update": rpc({
    cap: "team.manage",
    input: z.object({
      id: zId,
      name: zText(120).min(2).optional(),
      role: z.enum(ROLES).optional(),
      isActive: z.boolean().optional(),
    }),
    async run({ user }, { id, ...patch }) {
      const staff = await db.get<Staff>("staff", id);
      if (!staff) throw notFound("Employee");
      const losesAdmin = staff.role === "admin" && ((patch.role && patch.role !== "admin") || patch.isActive === false);
      if (losesAdmin) {
        if (id === user.id) throw new HttpError(409, "self_demotion", "You cannot remove your own administrator access");
        await assertAnotherAdmin(id);
      }
      if (patch.isActive !== undefined && patch.isActive !== staff.isActive) {
        await getStore().auth.setActive(id, patch.isActive);
      }
      const updated = await db.update<Staff>("staff", id, patch);
      await logActivity({
        actor: user,
        action: "staff_updated",
        entityType: "staff",
        entityId: id,
        description: `Employee ${updated.name} updated`,
        meta: { name: updated.name, role: updated.role, isActive: updated.isActive, changed: Object.keys(patch) },
      });
      return updated;
    },
  }),

  "team.resetPassword": rpc({
    cap: "team.manage",
    input: z.object({ id: zId, password: zPassword }),
    async run({ user }, { id, password }) {
      const staff = await db.get<Staff>("staff", id);
      if (!staff) throw notFound("Employee");
      await getStore().auth.setPassword(id, password);
      await logActivity({
        actor: user,
        action: "staff_updated",
        entityType: "staff",
        entityId: id,
        description: `Password reset for ${staff.name}`,
        meta: { name: staff.name, passwordReset: true },
      });
      return { ok: true };
    },
  }),

  "account.changePassword": rpc({
    input: z.object({ current: z.string().min(1).max(128), next: zPassword }),
    async run({ user }, { current, next }) {
      const verified = await getStore().auth.verify(user.email, current);
      if (verified !== user.id) throw badRequest("Your current password is incorrect", { field: "current" });
      await getStore().auth.setPassword(user.id, next);
      return { ok: true };
    },
  }),

  // ── Settings ──────────────────────────────────────────────────────────────
  "settings.update": rpc({
    cap: "settings.manage",
    input: z
      .object({
        agencyName: zText(160).min(1),
        agencyNameAr: zNullableText(160),
        licenseNumber: zNullableText(60),
        phone: zNullableText(30),
        whatsappNumber: z
          .string()
          .trim()
          .max(20)
          .nullable()
          .transform((v) => (v ? v.replace(/\D/g, "") : null))
          .refine((v) => !v || (v.length >= 8 && v.length <= 15), "Use the international format, digits only"),
        email: z.union([zEmail, z.literal(""), z.null()]).transform((v) => v || null),
        address: zNullableText(300),
        addressAr: zNullableText(300),
        hours: zNullableText(200),
        mapsUrl: zNullableText(1000).refine((v) => !v || /^https:\/\//.test(v), "Must be an https:// link"),
        facebookUrl: zNullableText(300).refine((v) => !v || /^https:\/\//.test(v), "Must be an https:// link"),
        instagramUrl: zNullableText(300).refine((v) => !v || /^https:\/\//.test(v), "Must be an https:// link"),
        crmLocale: z.enum(LOCALES),
        soundDefault: z.boolean(),
        autoAssign: z.enum(["off", "round_robin"]),
        autoContacted: z.boolean(),
        checklistItems: z
          .array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), label: zText(80).min(1) }))
          .min(1)
          .max(12),
      })
      .partial(),
    async run({ user }, patch) {
      await getSettings();
      const updated = await db.update<Settings>("settings", "agency", patch);
      await logActivity({
        actor: user,
        action: "settings_updated",
        entityType: "settings",
        entityId: "agency",
        description: `Settings updated (${Object.keys(patch).join(", ")})`,
        meta: { fields: Object.keys(patch) },
      });
      return updated;
    },
  }),

  // ── Integrations & demo tools ─────────────────────────────────────────────
  "integrations.status": rpc({
    cap: "integrations.manage",
    input: z.object({}),
    run: async ({ request }) => ({
      ...(await integrationStatus(request)),
      hasDemoData: await hasDemoData(),
      demoSeedLoaded: await demoSeedLoaded(),
    }),
  }),

  "integrations.test": rpc({
    cap: "integrations.manage",
    input: z.object({}),
    run: ({ user }) => testConnection(user.name),
  }),

  "demo.simulate": rpc({
    cap: "demo.tools",
    input: z.object({ scenario: z.enum(SCENARIOS) }),
    async run(_ctx, { scenario }) {
      requireDemoTools();
      return runScenario(scenario);
    },
  }),

  "demo.load": rpc({
    cap: "demo.tools",
    input: z.object({}),
    async run({ user }) {
      requireDemoTools();
      const result = await loadDemoData();
      await logActivity({
        actor: user,
        action: "demo_data",
        entityType: "system",
        description: `Sample data loaded (${result.leads} leads, ${result.packages} packages)`,
        meta: { loaded: true, ...result },
        isDemo: true,
      });
      return result;
    },
  }),

  "demo.clear": rpc({
    cap: "demo.tools",
    input: z.object({}),
    async run({ user }) {
      const removed = await clearDemoData();
      await logActivity({
        actor: user,
        action: "demo_data",
        entityType: "system",
        description: `Sample data removed (${removed} records)`,
        meta: { loaded: false, removed },
      });
      return { removed };
    },
  }),

  "activity.list": rpc({
    input: z.object({ before: z.string().max(40).optional(), limit: z.number().int().min(1).max(500).default(200) }),
    async run({ user }, { before, limit }) {
      const all = await db.list<Activity>("activity", { orderBy: "createdAt", desc: true, limit: 5000 });
      const visible = all.filter(
        (a) => (user.role !== "agent" || a.actorId === user.id || a.visibleTo.includes(user.id)) && (!before || a.createdAt < before),
      );
      return visible.slice(0, limit);
    },
  }),
};
