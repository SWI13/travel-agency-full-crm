import { createHash, randomUUID } from "node:crypto";
import { GENERIC_REF, type LeadSource, type ServiceType } from "~/lib/constants";
import type { FollowUp, Lead, Message, Package, Settings, SessionUser, Staff } from "~/lib/types";
import { logActivity, SYSTEM_ACTOR } from "./activity.server";
import { db } from "./db.server";
import { evalScript, KEY_PREFIX, redis, redisConfigured } from "./redis.server";
import { ConflictError } from "./store/index.server";
import type { Identity } from "./whatsapp/parse";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Deterministic ids make duplicates impossible at the storage level:
 * two webhooks for the same sender (or the same message) target the same row,
 * and the second insert is rejected with a conflict.
 */
export const leadIdForPhone = (phoneE164: string) => `l${hash(`phone:${phoneE164}`).slice(0, 31)}`;
export const leadIdForUser = (userId: string) => `l${hash(`bsuid:${userId}`).slice(0, 31)}`;
export const messageIdFor = (waMessageId: string) => `m${hash(waMessageId).slice(0, 31)}`;
export const eventIdFor = (rawBody: string) => `e${hash(rawBody).slice(0, 31)}`;

// ── Per-lead serialisation ──────────────────────────────────────────────────
// Within one process: a promise chain per key. Across serverless instances
// (Redis configured): additionally a short Redis lock, released by its owner only.
const holder = globalThis as unknown as { __crmLocks?: Map<string, Promise<unknown>> };
const locks = (holder.__crmLocks ??= new Map());
export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(() => (redisConfigured() ? withRedisLock(key, task) : task()));
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
async function withRedisLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const client = await redis();
  const lockKey = `${KEY_PREFIX}lock:${key}`;
  const token = randomUUID();
  const deadline = Date.now() + 15_000;
  // Wait for the other instance; after 15 s proceed anyway (ids stay deterministic, so no duplicates).
  while (Date.now() < deadline) {
    const taken = await client.set(lockKey, token, { condition: "NX", expiration: { type: "PX", value: 20_000 } });
    if (taken) break;
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 60));
  }
  try {
    return await task();
  } finally {
    await evalScript(RELEASE, [lockKey], [token]).catch(() => {});
  }
}

export function blankLead(now = new Date().toISOString()): Omit<Lead, "id" | "createdAt" | "updatedAt"> {
  return {
    phone: null,
    waUserId: null,
    waName: null,
    waUsername: null,
    displayName: null,
    serviceType: "unknown",
    stage: "new",
    priority: "normal",
    assignedTo: null,
    source: "unknown",
    adId: null,
    adTitle: null,
    adBody: null,
    adSourceUrl: null,
    adMediaType: null,
    ctwaClid: null,
    refCode: null,
    utmSource: null,
    utmCampaign: null,
    firstMessage: null,
    lastMessageText: null,
    lastMessageAt: null,
    lastMessageDirection: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    firstResponseAt: null,
    lastActivityAt: now,
    unreadCount: 0,
    packageId: null,
    departureCity: null,
    departureDate: null,
    returnDate: null,
    adults: null,
    children: null,
    roomPreference: null,
    budgetDzd: null,
    nextFollowUpAt: null,
    notes: null,
    tags: [],
    lostReason: null,
    isDemo: false,
  };
}

export async function findLead(identity: Identity): Promise<Lead | null> {
  if (identity.phone) {
    const byPhone = await db.get<Lead>("leads", leadIdForPhone(identity.phone));
    if (byPhone) return byPhone;
  }
  if (identity.userId) {
    const [byUser] = await db.list<Lead>("leads", { where: { waUserId: identity.userId }, limit: 1 });
    if (byUser) return byUser;
  }
  return null;
}

export const newLeadId = (identity: Identity) =>
  identity.phone ? leadIdForPhone(identity.phone) : leadIdForUser(identity.userId!);

export async function findPackageByRef(refCode: string | null): Promise<Package | null> {
  if (!refCode || refCode === GENERIC_REF) return null;
  const [pkg] = await db.list<Package>("packages", { where: { refCode }, limit: 1 });
  return pkg ?? null;
}

/** Round-robin across active agents when the agency enabled automatic assignment. */
export async function pickAssignee(settings: Settings): Promise<Staff | null> {
  if (settings.autoAssign !== "round_robin") return null;
  const agents = (await db.list<Staff>("staff", { where: { role: "agent" } })).filter((a) => a.isActive);
  if (!agents.length) return null;
  const chosen = agents[settings.assignCursor % agents.length];
  await db.update("settings", "agency", { assignCursor: (settings.assignCursor + 1) % 1_000_000 }, { silent: true });
  return chosen;
}

/** Keeps `lead.nextFollowUpAt` equal to the earliest pending follow-up. */
export async function syncNextFollowUp(lead: Lead): Promise<Lead> {
  const pending = await db.list<FollowUp>("followups", { where: { leadId: lead.id, status: "pending" } });
  const next = pending.map((f) => f.dueAt).sort()[0] ?? null;
  if (next === lead.nextFollowUpAt) return lead;
  return db.update<Lead>("leads", lead.id, { nextFollowUpAt: next });
}

/** When a lead changes hands, its conversation, follow-ups and bookings follow. */
export async function reassignLeadChildren(lead: Lead, previous: string | null): Promise<void> {
  const next = lead.assignedTo;
  for (const collection of ["followups", "bookings", "pilgrims"] as const) {
    const rows = await db.list<{ id: string; assignedTo: string | null; status?: string }>(collection, {
      where: { leadId: lead.id },
    });
    for (const row of rows) {
      if (collection === "followups" && row.status === "done") continue;
      if (row.assignedTo === next) continue;
      await db.update(collection, row.id, { assignedTo: next }, { previousAssignee: previous });
    }
  }
}

interface InquiryInput {
  phone: string;
  name?: string | null;
  source: Extract<LeadSource, "website_form" | "manual">;
  message?: string | null;
  packageId?: string | null;
  serviceType?: ServiceType;
  adults?: number | null;
  children?: number | null;
  departureCity?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  assignedTo?: string | null;
  actor: SessionUser | typeof SYSTEM_ACTOR;
  settings: Settings;
}

/**
 * Creates or updates a lead from a non-WhatsApp inquiry (website form, walk-in, phone call).
 * Existing leads only get their empty fields filled: nothing typed by staff is overwritten.
 */
export async function upsertLeadFromInquiry(input: InquiryInput): Promise<{ lead: Lead; isNew: boolean }> {
  const id = leadIdForPhone(input.phone);
  return withLock(id, async () => {
    const now = new Date().toISOString();
    const name = input.name?.trim() || null;
    const text = input.message?.trim() || null;
    let lead = await db.get<Lead>("leads", id);
    let isNew = false;

    if (!lead) {
      const assignee = input.assignedTo
        ? await db.get<Staff>("staff", input.assignedTo)
        : await pickAssignee(input.settings);
      try {
        lead = await db.create<Lead>(
          "leads",
          {
            ...blankLead(now),
            phone: input.phone,
            displayName: name,
            source: input.source,
            serviceType: input.serviceType ?? "unknown",
            packageId: input.packageId ?? null,
            adults: input.adults ?? null,
            children: input.children ?? null,
            departureCity: input.departureCity ?? null,
            utmSource: input.utmSource ?? null,
            utmCampaign: input.utmCampaign ?? null,
            firstMessage: text,
            lastMessageText: text,
            lastMessageAt: text ? now : null,
            lastMessageDirection: text ? "inbound" : null,
            lastInboundAt: input.source === "website_form" ? now : null,
            unreadCount: input.source === "website_form" ? 1 : 0,
            assignedTo: assignee?.id ?? null,
          },
          { id, notify: input.source === "website_form" ? "new_lead" : undefined },
        );
        isNew = true;
        await logActivity({
          actor: input.actor,
          action: "lead_created",
          entityType: "lead",
          lead,
          description: `New lead from ${input.source === "website_form" ? "the website form" : "manual entry"}`,
          meta: { source: input.source, phone: input.phone },
        });
        if (assignee) {
          await logActivity({
            actor: input.assignedTo ? input.actor : SYSTEM_ACTOR,
            action: "lead_assigned",
            entityType: "lead",
            lead,
            description: `Lead assigned to ${assignee.name}`,
            meta: { to: assignee.id, toName: assignee.name, auto: !input.assignedTo },
          });
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        lead = await db.get<Lead>("leads", id);
      }
    }
    if (!lead) throw new Error("Lead could not be created");

    if (!isNew) {
      const patch: Record<string, unknown> = { lastActivityAt: now };
      if (!lead.displayName && name) patch.displayName = name;
      if (!lead.packageId && input.packageId) patch.packageId = input.packageId;
      if (lead.serviceType === "unknown" && input.serviceType && input.serviceType !== "unknown") {
        patch.serviceType = input.serviceType;
      }
      if (lead.adults == null && input.adults != null) patch.adults = input.adults;
      if (lead.children == null && input.children != null) patch.children = input.children;
      if (!lead.utmSource && input.utmSource) patch.utmSource = input.utmSource;
      if (!lead.utmCampaign && input.utmCampaign) patch.utmCampaign = input.utmCampaign;
      if (input.source === "website_form") {
        patch.unreadCount = lead.unreadCount + 1;
        patch.lastInboundAt = now;
        if (text) Object.assign(patch, { lastMessageText: text, lastMessageAt: now, lastMessageDirection: "inbound" });
      }
      lead = await db.update<Lead>("leads", lead.id, patch, {
        notify: input.source === "website_form" ? "new_message" : undefined,
      });
    }

    if (input.source === "website_form") {
      // Shown in the conversation timeline, clearly typed as a website form entry.
      const formId = `form-${randomUUID()}`;
      await db.create<Message>(
        "messages",
        {
          leadId: lead.id,
          waMessageId: formId,
          direction: "inbound",
          type: "website_form",
          body: text ?? "",
          timestamp: now,
          status: null,
          referral: null,
          isDemo: lead.isDemo,
          isHistory: false,
          processed: true,
        },
        { id: messageIdFor(formId), userIds: lead.assignedTo ? [lead.assignedTo] : [] },
      );
    }
    return { lead, isNew };
  });
}
