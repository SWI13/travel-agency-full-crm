import { AD_SOURCES, REF_CODE_RE, type LeadSource, type ServiceType } from "~/lib/constants";
import { waIdToE164 } from "~/lib/phone";
import type { Referral } from "~/lib/types";

/**
 * Pure parsing of Meta WhatsApp Cloud API webhook payloads.
 * No I/O here so the logic can be unit-tested against documented payload shapes.
 *
 * Handled `changes[].field` values:
 *   messages            – customer messages and delivery statuses
 *   smb_message_echoes  – messages the agency sent from the WhatsApp Business app (Coexistence)
 *   history             – past conversations shared during Coexistence onboarding
 *   smb_app_state_sync  – contacts from the WhatsApp Business app
 *   account_update      – onboarding / offboarding notices
 */

export interface Identity {
  /** E.164 phone. Absent when the customer uses a WhatsApp username and Meta withholds the number. */
  phone: string | null;
  /** Business-scoped user ID (BSUID). */
  userId: string | null;
  username: string | null;
}

export interface ParsedMessage {
  waMessageId: string;
  timestamp: string;
  type: string;
  body: string;
  referral: Referral | null;
}

export type ParsedEvent =
  | { kind: "inbound"; phoneNumberId: string; identity: Identity; profileName: string | null; message: ParsedMessage }
  | { kind: "echo"; phoneNumberId: string; identity: Identity; message: ParsedMessage }
  | {
      kind: "history";
      phoneNumberId: string;
      identity: Identity;
      messages: Array<ParsedMessage & { direction: "inbound" | "outbound"; status: string | null }>;
    }
  | { kind: "status"; phoneNumberId: string; waMessageId: string; status: string }
  | { kind: "contact"; phoneNumberId: string; identity: Identity; name: string | null; action: string }
  | { kind: "notice"; phoneNumberId: string; level: "info" | "error"; message: string }
  | { kind: "ignored"; phoneNumberId: string; reason: string };

type Json = Record<string, any>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function toIso(timestamp: unknown): string {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  return new Date().toISOString();
}

function parseReferral(raw: unknown): Referral | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Json;
  const referral: Referral = {
    sourceType: str(r.source_type),
    sourceId: str(r.source_id),
    sourceUrl: str(r.source_url),
    headline: str(r.headline),
    body: str(r.body),
    mediaType: str(r.media_type),
    ctwaClid: str(r.ctwa_clid),
  };
  return Object.values(referral).some(Boolean) ? referral : null;
}

/** Readable text for any message type. Media content itself is not downloaded. */
export function messageBody(m: Json): string {
  const type = String(m.type ?? "unknown");
  switch (type) {
    case "text":
      return str(m.text?.body) ?? "";
    case "image":
    case "video":
    case "document": {
      const caption = str(m[type]?.caption);
      const name = type === "document" ? str(m.document?.filename) : null;
      return `[${type}]${name ? ` ${name}` : ""}${caption ? ` ${caption}` : ""}`;
    }
    case "audio":
      return m.audio?.voice ? "[voice message]" : "[audio]";
    case "sticker":
      return "[sticker]";
    case "location": {
      const { latitude, longitude, name } = m.location ?? {};
      return `[location]${name ? ` ${name}` : ""}${latitude != null ? ` ${latitude}, ${longitude}` : ""}`;
    }
    case "contacts":
      return `[contact] ${(m.contacts ?? []).map((c: Json) => c?.name?.formatted_name).filter(Boolean).join(", ")}`.trim();
    case "button":
      return str(m.button?.text) ?? "[button]";
    case "interactive":
      return (
        str(m.interactive?.button_reply?.title) ??
        str(m.interactive?.list_reply?.title) ??
        "[interactive reply]"
      );
    case "reaction":
      return `[reaction] ${m.reaction?.emoji ?? ""}`.trim();
    case "order":
      return "[order]";
    case "media_placeholder":
      return "[media]";
    case "revoke":
      return "[message deleted]";
    case "edit":
      return str(m.edit?.message?.text?.body) ?? "[message edited]";
    case "system":
      return str(m.system?.body) ?? "[system message]";
    case "unsupported":
      return "[unsupported message type — check the WhatsApp Business app]";
    default:
      return `[${type}]`;
  }
}

function parseMessage(m: Json): ParsedMessage | null {
  const id = str(m.id);
  if (!id) return null;
  return {
    waMessageId: id,
    timestamp: toIso(m.timestamp),
    type: String(m.type ?? "unknown"),
    body: messageBody(m).slice(0, 4000),
    referral: parseReferral(m.referral),
  };
}

/** Extracts every actionable event from a webhook body. Unknown shapes are ignored, never thrown. */
export function parseWebhook(body: unknown): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const root = body as Json;
  if (!root || typeof root !== "object") return events;

  // Declined history sharing arrives without the usual object/entry wrapper.
  if (!root.entry && Array.isArray(root.history)) {
    collectHistory(root, events);
    return events;
  }
  if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return events;

  for (const entry of root.entry) {
    for (const change of entry?.changes ?? []) {
      const value: Json = change?.value ?? {};
      const phoneNumberId = String(value.metadata?.phone_number_id ?? "");
      const field = String(change?.field ?? "");

      if (field === "messages") {
        const contacts: Json[] = Array.isArray(value.contacts) ? value.contacts : [];
        for (const m of value.messages ?? []) {
          const message = parseMessage(m);
          if (!message) continue;
          const contact =
            contacts.find((c) => (c.wa_id && c.wa_id === m.from) || (c.user_id && c.user_id === m.from_user_id)) ??
            contacts[0];
          const identity: Identity = {
            phone: waIdToE164(m.from ?? contact?.wa_id),
            userId: str(m.from_user_id) ?? str(contact?.user_id),
            username: str(contact?.profile?.username),
          };
          if (!identity.phone && !identity.userId) {
            events.push({ kind: "ignored", phoneNumberId, reason: "message without sender identity" });
            continue;
          }
          events.push({
            kind: "inbound",
            phoneNumberId,
            identity,
            profileName: str(contact?.profile?.name),
            message,
          });
        }
        for (const s of value.statuses ?? []) {
          if (str(s.id) && str(s.status)) {
            events.push({ kind: "status", phoneNumberId, waMessageId: s.id, status: s.status });
          }
        }
        for (const e of value.errors ?? []) {
          events.push({ kind: "notice", phoneNumberId, level: "error", message: `Meta error ${e.code}: ${e.title ?? e.message ?? ""}` });
        }
      } else if (field === "smb_message_echoes") {
        const contacts: Json[] = Array.isArray(value.contacts) ? value.contacts : [];
        for (const m of value.message_echoes ?? []) {
          const message = parseMessage(m);
          if (!message) continue;
          const contact = contacts.find((c) => c.wa_id && c.wa_id === m.to) ?? contacts[0];
          const identity: Identity = {
            phone: waIdToE164(m.to ?? contact?.wa_id),
            userId: str(m.to_user_id) ?? str(contact?.user_id),
            username: str(contact?.profile?.username),
          };
          if (!identity.phone && !identity.userId) continue;
          events.push({ kind: "echo", phoneNumberId, identity, message });
        }
      } else if (field === "history") {
        collectHistory(value, events);
      } else if (field === "smb_app_state_sync") {
        for (const item of value.state_sync ?? []) {
          if (item?.type !== "contact") continue;
          const identity: Identity = {
            phone: waIdToE164(item.contact?.phone_number),
            userId: str(item.contact?.user_id),
            username: str(item.contact?.username),
          };
          if (!identity.phone && !identity.userId) continue;
          events.push({
            kind: "contact",
            phoneNumberId,
            identity,
            name: str(item.contact?.full_name) ?? str(item.contact?.first_name),
            action: String(item.action ?? "add"),
          });
        }
      } else if (field === "account_update") {
        const reason = value.disconnection_info?.reason ? ` (${value.disconnection_info.reason})` : "";
        events.push({
          kind: "notice",
          phoneNumberId,
          level: /REMOVED|OFFBOARDED/.test(String(value.event)) ? "error" : "info",
          message: `Account update: ${value.event ?? "unknown"}${reason}`,
        });
      } else {
        events.push({ kind: "ignored", phoneNumberId, reason: `unhandled field "${field}"` });
      }
    }
  }
  return events;
}

function collectHistory(value: Json, events: ParsedEvent[]) {
  const phoneNumberId = String(value.metadata?.phone_number_id ?? "");
  const business = String(value.metadata?.display_phone_number ?? "").replace(/\D/g, "");
  for (const chunk of value.history ?? []) {
    for (const e of chunk?.errors ?? []) {
      events.push({
        kind: "notice",
        phoneNumberId,
        level: "error",
        message: `History sync: ${e.message ?? e.title ?? "error"} (code ${e.code})`,
      });
    }
    for (const thread of chunk?.threads ?? []) {
      const identity: Identity = {
        phone: waIdToE164(thread.id ?? thread.context?.wa_id),
        userId: str(thread.context?.user_id),
        username: str(thread.context?.username),
      };
      if (!identity.phone && !identity.userId) continue;
      const messages = [];
      for (const m of thread.messages ?? []) {
        const message = parseMessage(m);
        if (!message) continue;
        const fromDigits = String(m.from ?? "").replace(/\D/g, "");
        const outbound = Boolean(m.to) || (business !== "" && fromDigits === business);
        messages.push({
          ...message,
          direction: outbound ? ("outbound" as const) : ("inbound" as const),
          status: str(m.history_context?.status),
        });
      }
      if (messages.length) events.push({ kind: "history", phoneNumberId, identity, messages });
    }
  }
}

/** Reference code typed by a website WhatsApp button, e.g. "[OMR-01] Salam…" -> "OMR-01". */
export function parseRefCode(text: string | null | undefined): string | null {
  return REF_CODE_RE.exec(text ?? "")?.[1] ?? null;
}

/**
 * Where did this conversation come from? Uses only what Meta supplied:
 * an ad is never claimed without a referral object.
 */
export function classifySource(referral: Referral | null, text: string | null): LeadSource {
  if (referral) {
    const url = (referral.sourceUrl ?? "").toLowerCase();
    const platform = /instagram\.com|ig\.me/.test(url)
      ? "instagram"
      : /facebook\.com|fb\.me|fb\.com|fb\.watch/.test(url)
        ? "facebook"
        : null;
    if (referral.sourceType === "ad") {
      return platform === "instagram" ? "instagram_ad" : platform === "facebook" ? "facebook_ad" : "meta_ad";
    }
    return "meta_post";
  }
  if (parseRefCode(text)) return "website_whatsapp";
  return "organic";
}

/** Sources that may be replaced when better attribution arrives later. */
export const isWeakSource = (source: LeadSource) => !AD_SOURCES.includes(source) && source !== "meta_post";

/** Detects the service from the customer's own words. Employees can always change it. */
export function detectService(text: string | null | undefined): ServiceType {
  const t = (text ?? "").toLowerCase();
  const umrah = /عمر[ةه]|العمر[ةه]|\b(omra|omrah|umrah|umra|oumra)\b/.test(t);
  const hajj = /(^|[^؀-ۿ])(ال)?حج($|[^؀-ۿ])|\b(hajj|hadj|haj)\b/.test(t);
  if (umrah && !hajj) return "umrah";
  if (hajj && !umrah) return "hajj";
  return "unknown";
}
