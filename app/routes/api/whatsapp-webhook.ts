import { timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { db } from "~/server/db.server";
import { env } from "~/server/env.server";
import { HttpError } from "~/server/errors";
import { ensureBootstrap } from "~/server/session.server";
import { ingestWebhook, recordIntegrationError } from "~/server/whatsapp/ingest.server";
import { verifySignature } from "~/server/whatsapp/signature";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

/**
 * GET /api/whatsapp/webhook — Meta's verification handshake.
 * Meta sends hub.mode=subscribe, hub.verify_token and hub.challenge; the
 * challenge is echoed only when the token matches WHATSAPP_VERIFY_TOKEN.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = Buffer.from(url.searchParams.get("hub.verify_token") ?? "");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = Buffer.from(env.whatsapp.verifyToken);

  if (!expected.length) return text("WhatsApp webhook is not configured", 503);
  if (mode !== "subscribe" || token.length !== expected.length || !timingSafeEqual(token, expected)) {
    return text("Forbidden", 403);
  }
  await ensureBootstrap();
  await db.update("integration", "whatsapp", { webhookVerifiedAt: new Date().toISOString() }).catch(() => {});
  return text(challenge, 200);
}

/**
 * POST /api/whatsapp/webhook — event notifications.
 * X-Hub-Signature-256 is verified against the raw body before anything is parsed.
 * 200 is returned only after the event was stored and processed; a failure answers
 * 500 so that Meta retries (it keeps retrying for up to 36 hours).
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return text("Method not allowed", 405);
  if (!env.whatsapp.appSecret) return text("WhatsApp webhook is not configured", 503);

  const rawBody = await request.text();
  if (rawBody.length > 3_000_000) return text("Payload too large", 413);

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), env.whatsapp.appSecret)) {
    await ensureBootstrap();
    await recordIntegrationError("Rejected a webhook with an invalid signature (check WHATSAPP_APP_SECRET)");
    return text("Invalid signature", 401);
  }

  try {
    await ensureBootstrap();
    const result = await ingestWebhook(rawBody);
    return Response.json({ received: true, status: result.status });
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) return text("Bad request", 400);
    console.error("[webhook] Processing failed:", error instanceof Error ? error.message : error);
    return text("Processing failed", 500);
  }
}
