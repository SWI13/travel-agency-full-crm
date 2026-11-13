import { describe, expect, it } from "vitest";
import { classifySource, detectService, isWeakSource, parseRefCode, parseWebhook } from "~/server/whatsapp/parse";
import { signPayload, verifySignature } from "~/server/whatsapp/signature";

/** Payloads follow the shapes documented by Meta for the WhatsApp Cloud API. */
const wrap = (field: string, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA_ID", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: "213770000000", phone_number_id: "PNID" }, ...value } }] }],
});

const textMessage = (extra: Record<string, unknown> = {}) => ({
  from: "213661234567",
  id: "wamid.ABC123",
  timestamp: "1749416383",
  type: "text",
  text: { body: "السلام عليكم، أريد معلومات عن العمرة" },
  ...extra,
});

describe("parseWebhook — incoming messages", () => {
  it("extracts phone, profile name, text, id, type and timestamp", () => {
    const events = parseWebhook(wrap("messages", { contacts: [{ profile: { name: "Karim" }, wa_id: "213661234567" }], messages: [textMessage()] }));
    expect(events).toHaveLength(1);
    const event = events[0];
    if (event.kind !== "inbound") throw new Error("expected inbound");
    expect(event.identity.phone).toBe("+213661234567");
    expect(event.profileName).toBe("Karim");
    expect(event.phoneNumberId).toBe("PNID");
    expect(event.message).toMatchObject({ waMessageId: "wamid.ABC123", type: "text", referral: null });
    expect(event.message.body).toContain("العمرة");
    expect(event.message.timestamp).toBe(new Date(1749416383 * 1000).toISOString());
  });

  it("handles a missing profile name", () => {
    const [event] = parseWebhook(wrap("messages", { contacts: [{ wa_id: "213661234567" }], messages: [textMessage()] }));
    expect(event.kind).toBe("inbound");
    if (event.kind === "inbound") expect(event.profileName).toBeNull();
  });

  it("handles a payload with no contacts array at all", () => {
    const [event] = parseWebhook(wrap("messages", { messages: [textMessage()] }));
    expect(event.kind).toBe("inbound");
    if (event.kind === "inbound") {
      expect(event.identity.phone).toBe("+213661234567");
      expect(event.profileName).toBeNull();
    }
  });

  it("extracts Click-to-WhatsApp referral fields", () => {
    const referral = {
      source_url: "https://fb.me/abc",
      source_id: "120200000000",
      source_type: "ad",
      headline: "Omra Ramadan",
      body: "Départ Alger",
      media_type: "image",
      ctwa_clid: "CLID123",
    };
    const [event] = parseWebhook(wrap("messages", { contacts: [{ profile: { name: "A" }, wa_id: "213661234567" }], messages: [textMessage({ referral })] }));
    if (event.kind !== "inbound") throw new Error("expected inbound");
    expect(event.message.referral).toEqual({
      sourceType: "ad",
      sourceId: "120200000000",
      sourceUrl: "https://fb.me/abc",
      headline: "Omra Ramadan",
      body: "Départ Alger",
      mediaType: "image",
      ctwaClid: "CLID123",
    });
  });

  it("supports business-scoped user IDs when Meta withholds the phone number", () => {
    const [event] = parseWebhook(
      wrap("messages", {
        contacts: [{ profile: { name: "Amina", username: "amina.h" }, user_id: "DZ.13491208655302741918" }],
        messages: [{ from_user_id: "DZ.13491208655302741918", id: "wamid.BSUID", timestamp: "1749416383", type: "text", text: { body: "Salam" } }],
      }),
    );
    if (event.kind !== "inbound") throw new Error("expected inbound");
    expect(event.identity).toEqual({ phone: null, userId: "DZ.13491208655302741918", username: "amina.h" });
  });

  it("gives readable text for media and interactive messages", () => {
    const messages = [
      { from: "213661234567", id: "w1", timestamp: "1", type: "image", image: { caption: "passeport" } },
      { from: "213661234567", id: "w2", timestamp: "1", type: "audio", audio: { voice: true } },
      { from: "213661234567", id: "w3", timestamp: "1", type: "interactive", interactive: { button_reply: { title: "Oui" } } },
      { from: "213661234567", id: "w4", timestamp: "1", type: "location", location: { latitude: 36.7, longitude: 3.05 } },
    ];
    const bodies = parseWebhook(wrap("messages", { messages })).map((e) => (e.kind === "inbound" ? e.message.body : ""));
    expect(bodies).toEqual(["[image] passeport", "[voice message]", "Oui", "[location] 36.7, 3.05"]);
  });

  it("reads delivery statuses", () => {
    const events = parseWebhook(wrap("messages", { statuses: [{ id: "wamid.ABC123", status: "read", timestamp: "1", recipient_id: "213661234567" }] }));
    expect(events).toEqual([{ kind: "status", phoneNumberId: "PNID", waMessageId: "wamid.ABC123", status: "read" }]);
  });

  it("ignores unknown objects, fields and malformed bodies without throwing", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook("nope")).toEqual([]);
    expect(parseWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseWebhook(wrap("message_template_status_update", {}))[0].kind).toBe("ignored");
    expect(parseWebhook(wrap("messages", { messages: [{ type: "text" }] }))).toEqual([]); // no id
  });
});

describe("parseWebhook — Coexistence", () => {
  it("reads echoes of messages sent from the WhatsApp Business app", () => {
    const [event] = parseWebhook(
      wrap("smb_message_echoes", { message_echoes: [{ from: "213770000000", to: "213661234567", id: "wamid.ECHO", timestamp: "1700255121", type: "text", text: { body: "Bonjour" } }] }),
    );
    if (event.kind !== "echo") throw new Error("expected echo");
    expect(event.identity.phone).toBe("+213661234567"); // the customer, not the business number
    expect(event.message.body).toBe("Bonjour");
  });

  it("reads history threads and tells inbound from outbound", () => {
    const [event] = parseWebhook(
      wrap("history", {
        history: [
          {
            metadata: { phase: 0, chunk_order: 1, progress: 55 },
            threads: [
              {
                id: "213661234567",
                messages: [
                  { from: "213661234567", id: "h1", timestamp: "1700000000", type: "text", text: { body: "Prix ?" }, history_context: { status: "read" } },
                  { from: "213770000000", to: "213661234567", id: "h2", timestamp: "1700000100", type: "text", text: { body: "285 000 DA" }, history_context: { status: "delivered" } },
                ],
              },
            ],
          },
        ],
      }),
    );
    if (event.kind !== "history") throw new Error("expected history");
    expect(event.messages.map((m) => [m.direction, m.status])).toEqual([
      ["inbound", "read"],
      ["outbound", "delivered"],
    ]);
  });

  it("reports declined history sharing (error 2593109) as a notice", () => {
    const events = parseWebhook({
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "213770000000", phone_number_id: "PNID" },
      history: [{ errors: [{ code: 2593109, title: "History sync is turned off", message: "History sync is turned off by the business from the WhatsApp Business App" }] }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "notice", level: "error" });
  });

  it("reads contact sync and account updates", () => {
    const contact = parseWebhook(wrap("smb_app_state_sync", { state_sync: [{ type: "contact", contact: { full_name: "Nadia B", phone_number: "213661234567" }, action: "add" }] }));
    expect(contact[0]).toMatchObject({ kind: "contact", name: "Nadia B" });
    const update = parseWebhook(wrap("account_update", { event: "PARTNER_REMOVED", disconnection_info: { reason: "PRIMARY_INACTIVITY" } }));
    expect(update[0]).toMatchObject({ kind: "notice", level: "error" });
  });
});

describe("attribution", () => {
  const ad = (sourceUrl: string, sourceType = "ad") => ({ sourceType, sourceId: "1", sourceUrl, headline: null, body: null, mediaType: null, ctwaClid: null });

  it("names the platform only when the referral proves it", () => {
    expect(classifySource(ad("https://fb.me/x"), "hi")).toBe("facebook_ad");
    expect(classifySource(ad("https://www.instagram.com/p/x/"), "hi")).toBe("instagram_ad");
    expect(classifySource(ad("https://example.com/x"), "hi")).toBe("meta_ad");
    expect(classifySource(ad("https://fb.me/x", "post"), "hi")).toBe("meta_post");
  });

  it("never invents an ad source without referral data", () => {
    expect(classifySource(null, "Bonjour")).toBe("organic");
    expect(classifySource(null, "[OMR-01] السلام عليكم")).toBe("website_whatsapp");
  });

  it("only lets ad attribution replace weaker sources", () => {
    expect(isWeakSource("organic")).toBe(true);
    expect(isWeakSource("website_whatsapp")).toBe(true);
    expect(isWeakSource("facebook_ad")).toBe(false);
  });

  it("parses website reference codes", () => {
    expect(parseRefCode("[OMR-01] Salam")).toBe("OMR-01");
    expect(parseRefCode("  [HAJ-123] x")).toBe("HAJ-123");
    expect(parseRefCode("Salam [OMR-01]")).toBeNull();
    expect(parseRefCode("[omr-01] x")).toBeNull();
    expect(parseRefCode(null)).toBeNull();
  });

  it("detects the service from the customer's words", () => {
    expect(detectService("أريد معلومات عن العمرة")).toBe("umrah");
    expect(detectService("Prix de la Omra svp")).toBe("umrah");
    expect(detectService("كم سعر الحج هذا العام؟")).toBe("hajj");
    expect(detectService("Inscription Hadj 2027")).toBe("hajj");
    expect(detectService("Bonjour")).toBe("unknown");
    expect(detectService("عمرة أو حج")).toBe("unknown"); // ambiguous: left to the employee
  });
});

describe("webhook signature", () => {
  const secret = "test-app-secret";
  const body = JSON.stringify({ hello: "wörld ✓" });

  it("accepts a correct X-Hub-Signature-256", () => {
    expect(verifySignature(body, signPayload(body, secret), secret)).toBe(true);
  });
  it("rejects a tampered body, a wrong secret and missing headers", () => {
    const header = signPayload(body, secret);
    expect(verifySignature(`${body} `, header, secret)).toBe(false);
    expect(verifySignature(body, signPayload(body, "other"), secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=abc", secret)).toBe(false);
    expect(verifySignature(body, header, "")).toBe(false);
  });
});
