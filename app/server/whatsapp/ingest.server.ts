import { DEMO_PHONE_NUMBER_ID } from "~/lib/constants";
import { serviceForCategory } from "~/lib/constants";
import { maskPhone } from "~/lib/phone";
import type { IntegrationState, Lead, Message, WebhookEvent } from "~/lib/types";
import { logActivity, SYSTEM_ACTOR } from "../activity.server";
import { db } from "../db.server";
import { env } from "../env.server";
import { HttpError } from "../errors";
import {
  blankLead,
  eventIdFor,
  findLead,
  findPackageByRef,
  messageIdFor,
  newLeadId,
  pickAssignee,
  withLock,
} from "../leads.server";
import { getSettings } from "../session.server";
import { ConflictError, getStore } from "../store/index.server";
import {
  classifySource,
  detectService,
  isWeakSource,
  parseRefCode,
  parseWebhook,
  type Identity,
  type ParsedEvent,
  type ParsedMessage,
} from "./parse";

/**
 * Webhook processing pipeline.
 *
 *  1. The raw event is stored (id = hash of the body) so retries are recognised.
 *  2. Each message is inserted with an id derived from its WhatsApp message id;
 *     a duplicate delivery hits a conflict and is skipped.
 *  3. The lead (id derived from the sender) is created or updated. Only
 *     conversation fields are touched — never what an employee typed.
 *  4. The event is marked processed. Any failure is recorded and re-thrown so the
 *     HTTP layer answers 500 and Meta retries.
 */

export interface IngestResult {
  status: "processed" | "duplicate" | "ignored";
  newLeads: number;
  messages: number;
  duplicates: number;
}

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, played: 4, failed: 5 };

export async function ingestWebhook(rawBody: string): Promise<IngestResult> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "invalid_json", "Webhook body is not valid JSON");
  }

  const events = parseWebhook(body);
  const result: IngestResult = { status: "processed", newLeads: 0, messages: 0, duplicates: 0 };
  const isDemo = events.length > 0 && events.every((e) => e.phoneNumberId === DEMO_PHONE_NUMBER_ID);

  if (isDemo && !env.demoTools) {
    return { ...result, status: "ignored" }; // simulated events are refused outside demo mode
  }

  const store = getStore();
  const eventId = eventIdFor(rawBody);
  const existing = await store.get<WebhookEvent>("webhook_events", eventId);
  if (existing && (existing.status === "processed" || existing.status === "ignored")) {
    return { ...result, status: "duplicate" };
  }
  if (!existing) {
    await store
      .create(
        "webhook_events",
        { status: "received", error: null, summary: summarize(events), payload: rawBody.slice(0, 60_000), isDemo },
        eventId,
      )
      .catch((error) => {
        if (!(error instanceof ConflictError)) throw error; // concurrent delivery of the same event
      });
  }

  try {
    for (const event of events) await handle(event, result);
    const ignoredOnly = events.length === 0 || events.every((e) => e.kind === "ignored");
    await store.update("webhook_events", eventId, { status: ignoredOnly ? "ignored" : "processed", error: null });
    const now = new Date().toISOString();
    await db.update<IntegrationState>("integration", "whatsapp", {
      lastWebhookAt: now,
      lastWebhookOk: true,
      ...(isDemo ? { lastDemoEventAt: now } : { lastRealEventAt: now }),
    });
    if (ignoredOnly) result.status = "ignored";
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await store.update("webhook_events", eventId, { status: "failed", error: message.slice(0, 600) }).catch(() => {});
    await recordIntegrationError(`Webhook processing failed: ${message}`, isDemo);
    throw error;
  }
}

function summarize(events: ParsedEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${k}×${n}`).join(", ") || "no actionable events";
}

export async function recordIntegrationError(message: string, isDemo = false): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update("integration", "whatsapp", { lastError: message.slice(0, 600), lastErrorAt: now, lastWebhookOk: false })
    .catch(() => {});
  await logActivity({
    actor: SYSTEM_ACTOR,
    action: "webhook_error",
    entityType: "integration",
    entityId: "whatsapp",
    description: message,
    isDemo,
  });
}

async function handle(event: ParsedEvent, result: IngestResult): Promise<void> {
  const isDemo = event.phoneNumberId === DEMO_PHONE_NUMBER_ID;
  const expected = env.whatsapp.phoneNumberId;
  if (!isDemo && expected && event.phoneNumberId && event.phoneNumberId !== expected) {
    // Another number of the same Meta app: not this agency's inbox.
    await logActivity({
      actor: SYSTEM_ACTOR,
      action: "integration_event",
      entityType: "integration",
      entityId: "whatsapp",
      description: "Ignored an event for a different WhatsApp phone number ID",
    });
    return;
  }

  switch (event.kind) {
    case "inbound":
      return void (await handleMessage(event.identity, event.message, "inbound", event.profileName, isDemo, result));
    case "echo":
      return void (await handleMessage(event.identity, event.message, "outbound", null, isDemo, result));
    case "history":
      return handleHistory(event, isDemo);
    case "status":
      return handleStatus(event.waMessageId, event.status);
    case "contact":
      return handleContact(event.identity, event.name);
    case "notice":
      if (event.level === "error") return recordIntegrationError(event.message, isDemo);
      return logActivity({
        actor: SYSTEM_ACTOR,
        action: "integration_event",
        entityType: "integration",
        entityId: "whatsapp",
        description: event.message,
        isDemo,
      });
    case "ignored":
      return;
  }
}

const later = (a: string | null, b: string) => (!a || b > a ? b : a);

async function handleMessage(
  identity: Identity,
  message: ParsedMessage,
  direction: "inbound" | "outbound",
  profileName: string | null,
  isDemo: boolean,
  result: IngestResult,
): Promise<void> {
  const settings = await getSettings();
  const lockKey = identity.phone ?? identity.userId!;

  await withLock(lockKey, async () => {
    let lead = await findLead(identity);
    const leadId = lead?.id ?? newLeadId(identity);
    const messageId = messageIdFor(message.waMessageId);

    // 1 — the message, exactly once.
    try {
      await db.create<Message>(
        "messages",
        {
          leadId,
          waMessageId: message.waMessageId,
          direction,
          type: message.type,
          body: message.body,
          timestamp: message.timestamp,
          status: null,
          referral: message.referral,
          isDemo,
          isHistory: false,
          processed: false,
        },
        { id: messageId, silent: true },
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const stored = await db.get<Message>("messages", messageId);
      if (!stored || stored.processed) {
        result.duplicates += 1;
        return; // already handled: a retry or duplicate delivery from Meta
      }
      // Stored but the lead update did not finish last time: continue below.
    }

    const now = new Date().toISOString();
    const inbound = direction === "inbound";
    const refCode = inbound ? parseRefCode(message.body) : null;
    const pkg = await findPackageByRef(refCode);
    const referral = message.referral;
    const source = inbound ? classifySource(referral, message.body) : "unknown";
    const fromOffer = pkg ? serviceForCategory(pkg.category) : "unknown";
    const service = inbound ? (fromOffer !== "unknown" ? fromOffer : detectService(message.body)) : "unknown";
    const adFields = referral
      ? {
          adId: referral.sourceId,
          adTitle: referral.headline,
          adBody: referral.body,
          adSourceUrl: referral.sourceUrl,
          adMediaType: referral.mediaType,
          ctwaClid: referral.ctwaClid,
        }
      : {};
    let created = false;

    // 2 — the lead.
    if (!lead) {
      const assignee = await pickAssignee(settings);
      try {
        lead = await db.create<Lead>(
          "leads",
          {
            ...blankLead(now),
            phone: identity.phone,
            waUserId: identity.userId,
            waUsername: identity.username,
            waName: profileName,
            // A conversation the agency started from its phone is already "contacted".
            stage: inbound ? "new" : "contacted",
            source,
            ...adFields,
            refCode,
            packageId: pkg?.id ?? null,
            serviceType: service,
            firstMessage: inbound ? message.body : null,
            lastMessageText: message.body,
            lastMessageAt: message.timestamp,
            lastMessageDirection: direction,
            lastInboundAt: inbound ? message.timestamp : null,
            lastOutboundAt: inbound ? null : message.timestamp,
            firstResponseAt: inbound ? null : message.timestamp,
            unreadCount: inbound ? 1 : 0,
            assignedTo: assignee?.id ?? null,
            isDemo,
          },
          { id: leadId, notify: inbound ? "new_lead" : undefined },
        );
        created = true;
        result.newLeads += 1;
        await logActivity({
          actor: SYSTEM_ACTOR,
          action: "lead_created",
          entityType: "lead",
          lead,
          description: `New WhatsApp lead ${profileName ?? maskPhone(identity.phone)}`,
          meta: { source, name: profileName, adTitle: referral?.headline ?? null },
        });
        if (assignee) {
          await logActivity({
            actor: SYSTEM_ACTOR,
            action: "lead_assigned",
            entityType: "lead",
            lead,
            description: `Lead assigned to ${assignee.name} automatically`,
            meta: { to: assignee.id, toName: assignee.name, auto: true },
          });
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        lead = await db.get<Lead>("leads", leadId); // created concurrently
      }
    }
    if (!lead) throw new Error("Lead could not be created or loaded");

    if (!created) {
      const patch: Record<string, unknown> = { lastActivityAt: now };
      if (profileName && profileName !== lead.waName) patch.waName = profileName;
      if (identity.userId && !lead.waUserId) patch.waUserId = identity.userId;
      if (identity.username && identity.username !== lead.waUsername) patch.waUsername = identity.username;
      if (identity.phone && !lead.phone) patch.phone = identity.phone;
      if (!lead.lastMessageAt || message.timestamp >= lead.lastMessageAt) {
        patch.lastMessageText = message.body;
        patch.lastMessageAt = message.timestamp;
        patch.lastMessageDirection = direction;
      }
      if (inbound) {
        patch.lastInboundAt = later(lead.lastInboundAt, message.timestamp);
        patch.unreadCount = lead.unreadCount + 1;
        if (!lead.firstMessage) patch.firstMessage = message.body;
        if (referral && isWeakSource(lead.source)) Object.assign(patch, { source }, adFields);
        else if (lead.source === "unknown") patch.source = source;
        if (refCode && !lead.refCode) patch.refCode = refCode;
        if (pkg && !lead.packageId) patch.packageId = pkg.id;
        if (lead.serviceType === "unknown" && service !== "unknown") patch.serviceType = service;
      } else {
        patch.lastOutboundAt = later(lead.lastOutboundAt, message.timestamp);
        if (!lead.firstResponseAt) patch.firstResponseAt = message.timestamp;
        patch.unreadCount = 0; // the agency answered from the phone, so the chat was read
        if (lead.stage === "new" && settings.autoContacted) patch.stage = "contacted";
      }
      const previousStage = lead.stage;
      lead = await db.update<Lead>("leads", lead.id, patch, { notify: inbound ? "new_message" : undefined });
      if (previousStage !== lead.stage) {
        await logActivity({
          actor: SYSTEM_ACTOR,
          action: "stage_changed",
          entityType: "lead",
          lead,
          description: "Stage moved to Contacted after a reply from the WhatsApp Business app",
          meta: { from: previousStage, to: lead.stage, auto: true },
        });
      }
      await logActivity({
        actor: SYSTEM_ACTOR,
        action: inbound ? "message_in" : "message_out",
        entityType: "lead",
        lead,
        description: inbound ? "Incoming WhatsApp message" : "Reply sent from the WhatsApp Business app",
        meta: { preview: message.body.slice(0, 120), type: message.type },
      });
    }

    // 3 — done: flag the message and publish it to the dashboards.
    await db.update<Message>("messages", messageId, { processed: true, leadId: lead.id }, {
      userIds: lead.assignedTo ? [lead.assignedTo] : [],
    });
    result.messages += 1;
  });
}

async function handleStatus(waMessageId: string, status: string): Promise<void> {
  const id = messageIdFor(waMessageId);
  const message = await db.get<Message>("messages", id);
  if (!message) return; // status for a message sent by another system
  if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[message.status ?? "pending"] ?? 0)) return;
  if (message.status === status) return;
  const lead = await db.get<Lead>("leads", message.leadId);
  await db.update("messages", id, { status }, { userIds: lead?.assignedTo ? [lead.assignedTo] : [] });
}

async function handleContact(identity: Identity, name: string | null): Promise<void> {
  // Address-book contacts do not become leads; they only enrich existing ones.
  const lead = await findLead(identity);
  if (lead && !lead.waName && name) await db.update("leads", lead.id, { waName: name });
}

/**
 * History shared during Coexistence onboarding. Imported messages are flagged,
 * never raise notifications and never count as unread.
 * NOTE: implemented from Meta's documented payload shape; not yet verified
 * against a live onboarded account.
 */
async function handleHistory(event: Extract<ParsedEvent, { kind: "history" }>, isDemo: boolean): Promise<void> {
  const { identity, messages } = event;
  await withLock(identity.phone ?? identity.userId!, async () => {
    let lead = await findLead(identity);
    const sorted = [...messages].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const latest = sorted[sorted.length - 1];
    if (!lead) {
      try {
        lead = await db.create<Lead>(
          "leads",
          {
            ...blankLead(latest.timestamp),
            phone: identity.phone,
            waUserId: identity.userId,
            waUsername: identity.username,
            stage: "contacted",
            source: "unknown",
            tags: ["history-import"],
            isDemo,
          },
          { id: newLeadId(identity) },
        );
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        lead = await findLead(identity);
      }
    }
    if (!lead) return;

    for (const m of sorted) {
      await db
        .create<Message>(
          "messages",
          {
            leadId: lead.id,
            waMessageId: m.waMessageId,
            direction: m.direction,
            type: m.type,
            body: m.body,
            timestamp: m.timestamp,
            status: m.status,
            referral: null,
            isDemo,
            isHistory: true,
            processed: true,
          },
          { id: messageIdFor(m.waMessageId), silent: true },
        )
        .catch((error) => {
          if (!(error instanceof ConflictError)) throw error;
        });
    }

    if (!lead.lastMessageAt || latest.timestamp > lead.lastMessageAt) {
      const firstInbound = sorted.find((m) => m.direction === "inbound");
      await db.update("leads", lead.id, {
        lastMessageText: latest.body,
        lastMessageAt: latest.timestamp,
        lastMessageDirection: latest.direction,
        firstMessage: lead.firstMessage ?? firstInbound?.body ?? null,
      });
    }
  });
}
