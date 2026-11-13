#!/usr/bin/env node
/**
 * Sends one signed WhatsApp webhook event to a running server, exactly as Meta
 * would. Useful to check a deployment before the real number is connected.
 *
 *   npm run simulate -- --url https://crm.example.dz --from 213661234567 --name "Test" --text "Salam"
 *   npm run simulate -- --ad            # adds Click-to-WhatsApp referral data
 *   npm run simulate -- --demo          # marks the lead as DEMO (needs DEMO_TOOLS=true on the server)
 *
 * Reads WHATSAPP_APP_SECRET and WHATSAPP_PHONE_NUMBER_ID from the environment or .env.
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile?.(".env");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const secret = process.env.WHATSAPP_APP_SECRET;
if (!secret) {
  console.error("WHATSAPP_APP_SECRET is not set. The server rejects unsigned webhooks, so there is nothing to send.");
  process.exit(1);
}

const url = `${option("url", "http://localhost:5173").replace(/\/+$/, "")}/api/whatsapp/webhook`;
const from = option("from", `2135550${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`);
const name = option("name", "");
const message = {
  from,
  id: `wamid.SIM${randomBytes(10).toString("hex").toUpperCase()}`,
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: "text",
  text: { body: option("text", "السلام عليكم، أريد معلومات عن العمرة") },
};
if (flag("ad")) {
  message.referral = {
    source_url: "https://fb.me/simulated-ad",
    source_id: "SIMULATED_AD_ID",
    source_type: "ad",
    headline: "Simulated ad headline",
    body: "Simulated ad body",
    media_type: "image",
    ctwa_clid: `SIM${randomBytes(6).toString("hex")}`,
  };
}

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "SIMULATED_WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "SIMULATED",
              phone_number_id: flag("demo") ? "DEMO" : process.env.WHATSAPP_PHONE_NUMBER_ID || "SIMULATED",
            },
            contacts: [{ ...(name ? { profile: { name } } : {}), wa_id: from }],
            messages: [message],
          },
        },
      ],
    },
  ],
});

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  },
  body,
});
console.log(`${response.status} ${await response.text()}`);
console.log(response.ok ? `Sent a message from +${from}. Check the WhatsApp Leads page.` : "The server refused the event (see the status above).");
process.exit(response.ok ? 0 : 1);
