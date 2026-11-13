import { randomBytes, randomInt } from "node:crypto";
import { DEMO_PHONE_NUMBER_ID } from "~/lib/constants";
import type { Lead, Package } from "~/lib/types";
import { db } from "../db.server";
import { ingestWebhook, type IngestResult } from "./ingest.server";

/**
 * Development-only webhook simulator. It builds payloads in Meta's real format
 * (with the reserved phone_number_id "DEMO") and sends them through the very
 * same pipeline as production webhooks. Everything created is flagged isDemo.
 */

export const SCENARIOS = [
  "new_customer",
  "returning_customer",
  "no_profile_name",
  "ctwa_facebook",
  "ctwa_instagram",
  "website_ref",
  "duplicate",
  "burst",
  "staff_reply",
  "username_only",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

const NAMES = [
  "Karim Benali", "Amina Hadj Ali", "Yacine Meziane", "Fatima Zohra B.", "Mohamed Cherif",
  "Nadia Belkacem", "Abdelkader S.", "Samira Touati", "Rachid Bouzid", "Khadidja Mansouri",
];
const TEXTS = [
  "السلام عليكم، أريد معلومات عن عمرة رمضان",
  "Bonjour, je voudrais les prix de la Omra pour 2 personnes",
  "سلام، كم سعر الحج هذا العام؟",
  "Salam, est-ce qu'il reste des places pour le départ de mars ?",
  "أريد حجز عمرة لأربعة أشخاص من فضلكم",
  "Bonjour, quels documents faut-il pour la Omra ?",
];
const FOLLOW_UPS = [
  "هل يمكن الدفع بالتقسيط؟",
  "D'accord merci, et l'hôtel est à quelle distance du Haram ?",
  "متى آخر أجل للتسجيل؟",
  "Je peux passer à l'agence demain ?",
];

const pick = <T>(list: readonly T[]) => list[randomInt(list.length)];
const wamid = () => `wamid.DEMO${randomBytes(12).toString("hex").toUpperCase()}`;
/** Fictional range: +213 555 00 xx xx is not assigned to real subscribers in this demo. */
const demoWaId = () => `21355500${String(randomInt(10_000)).padStart(4, "0")}`;
const nowTs = () => String(Math.floor(Date.now() / 1000));

interface MessageOptions {
  from?: string;
  userId?: string;
  username?: string;
  name?: string | null;
  text: string;
  id?: string;
  referral?: Record<string, unknown>;
}

export function buildInboundPayload(o: MessageOptions) {
  const contact: Record<string, unknown> = {};
  const profile: Record<string, unknown> = {};
  if (o.name) profile.name = o.name;
  if (o.username) profile.username = o.username;
  if (Object.keys(profile).length) contact.profile = profile;
  if (o.from) contact.wa_id = o.from;
  if (o.userId) contact.user_id = o.userId;

  const message: Record<string, unknown> = { id: o.id ?? wamid(), timestamp: nowTs(), type: "text", text: { body: o.text } };
  if (o.from) message.from = o.from;
  if (o.userId) message.from_user_id = o.userId;
  if (o.referral) message.referral = o.referral;

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "DEMO_WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "DEMO", phone_number_id: DEMO_PHONE_NUMBER_ID },
              contacts: [contact],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

export function buildEchoPayload(to: string, text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "DEMO_WABA",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "DEMO", phone_number_id: DEMO_PHONE_NUMBER_ID },
              message_echoes: [{ from: "DEMO", to, id: wamid(), timestamp: nowTs(), type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

const referral = (platform: "facebook" | "instagram") => ({
  source_url: platform === "facebook" ? "https://fb.me/demo-ad-umrah" : "https://www.instagram.com/p/demo-ad-umrah/",
  source_id: `DEMO${randomInt(100000, 999999)}`,
  source_type: "ad",
  headline: platform === "facebook" ? "[DEMO] Omra Ramadan — départ Alger" : "[DEMO] عمرة شعبان — أماكن محدودة",
  body: "[DEMO] Publicité de démonstration",
  media_type: "image",
  ctwa_clid: `DEMOCLID${randomBytes(8).toString("hex")}`,
});

async function latestDemoLead(): Promise<Lead | null> {
  const leads = await db.list<Lead>("leads", { where: { isDemo: true }, orderBy: "lastActivityAt", desc: true, limit: 20 });
  return leads.find((l) => l.phone) ?? null;
}

const send = (payload: unknown) => ingestWebhook(JSON.stringify(payload));

export async function runScenario(scenario: Scenario): Promise<{ scenario: Scenario; results: IngestResult[]; note?: string }> {
  switch (scenario) {
    case "new_customer":
      return { scenario, results: [await send(buildInboundPayload({ from: demoWaId(), name: pick(NAMES), text: pick(TEXTS) }))] };

    case "no_profile_name":
      return { scenario, results: [await send(buildInboundPayload({ from: demoWaId(), name: null, text: pick(TEXTS) }))] };

    case "ctwa_facebook":
    case "ctwa_instagram": {
      const platform = scenario === "ctwa_facebook" ? "facebook" : "instagram";
      return {
        scenario,
        results: [await send(buildInboundPayload({ from: demoWaId(), name: pick(NAMES), text: pick(TEXTS), referral: referral(platform) }))],
      };
    }

    case "website_ref": {
      const [pkg] = await db.list<Package>("packages", { where: { status: "active" }, limit: 1 });
      const code = pkg?.refCode ?? "WEB-00";
      return {
        scenario,
        results: [await send(buildInboundPayload({ from: demoWaId(), name: pick(NAMES), text: `[${code}] السلام عليكم، أريد معلومات عن هذا العرض` }))],
        note: pkg ? `Linked to package ${pkg.refCode}` : "No active package: generic website reference used",
      };
    }

    case "returning_customer": {
      const lead = await latestDemoLead();
      if (!lead) return runScenario("new_customer");
      return {
        scenario,
        results: [await send(buildInboundPayload({ from: lead.phone!.slice(1), name: lead.waName, text: pick(FOLLOW_UPS) }))],
      };
    }

    case "staff_reply": {
      const lead = await latestDemoLead();
      if (!lead) return { scenario, results: [], note: "No demo lead yet — simulate a customer message first" };
      return { scenario, results: [await send(buildEchoPayload(lead.phone!.slice(1), "وعليكم السلام، مرحبا بك. سنرسل لك التفاصيل حالا."))] };
    }

    case "duplicate": {
      // The exact same delivery twice, as Meta does when it retries.
      const payload = buildInboundPayload({ from: demoWaId(), name: pick(NAMES), text: pick(TEXTS) });
      const first = await send(payload);
      const second = await send(payload);
      return { scenario, results: [first, second] };
    }

    case "burst": {
      const payloads = Array.from({ length: 5 }, () =>
        buildInboundPayload({ from: demoWaId(), name: pick(NAMES), text: pick(TEXTS) }),
      );
      return { scenario, results: await Promise.all(payloads.map(send)) };
    }

    case "username_only":
      // A customer who adopted a WhatsApp username: Meta may withhold the phone number.
      return {
        scenario,
        results: [
          await send(
            buildInboundPayload({
              userId: `DZ.${randomInt(1e9, 9e9)}${randomInt(1e9, 9e9)}`,
              username: `demo.pilgrim${randomInt(100, 999)}`,
              name: pick(NAMES),
              text: pick(TEXTS),
            }),
          ),
        ],
      };
  }
}
