import type { IntegrationState, WebhookEvent } from "~/lib/types";
import { logActivity } from "../activity.server";
import { db } from "../db.server";
import { env, whatsappConfig } from "../env.server";
import { getStore } from "../store/index.server";

export type ConnectionState = "not_connected" | "configured" | "connected" | "error";

/** Public URL Meta must call. Derived from PUBLIC_BASE_URL or the current request. */
export function webhookUrl(request: Request): string {
  const base = env.publicBaseUrl || new URL(request.url).origin;
  return `${base}/api/whatsapp/webhook`;
}

/**
 * Honest connection status: "connected" is only reported after a successful
 * Graph API test with the configured credentials. Demo events never count.
 */
export async function integrationStatus(request: Request) {
  const config = whatsappConfig();
  const store = getStore();
  const state = (await db.get<IntegrationState>("integration", "whatsapp")) ?? ({} as IntegrationState);
  const health = await store.health(true);
  const events = await store.list<WebhookEvent>("webhook_events", { orderBy: "createdAt", desc: true, limit: 12 });

  let connection: ConnectionState = "not_connected";
  if (config.canReceive) {
    connection = state.lastTestOk === true ? "connected" : state.lastTestOk === false ? "error" : "configured";
  }

  return {
    connection,
    config: { present: config.present, missing: config.missing, canReceive: config.canReceive, canCallApi: config.canCallApi },
    webhookUrl: webhookUrl(request),
    isPublicUrl: /^https:\/\//.test(webhookUrl(request)) && !/localhost|127\.0\.0\.1/.test(webhookUrl(request)),
    graphVersion: env.whatsapp.graphVersion,
    database: { driver: store.kind, ok: health.ok, detail: health.detail },
    demoTools: env.demoTools,
    state: {
      webhookVerifiedAt: state.webhookVerifiedAt ?? null,
      lastWebhookAt: state.lastWebhookAt ?? null,
      lastWebhookOk: state.lastWebhookOk ?? null,
      lastRealEventAt: state.lastRealEventAt ?? null,
      lastDemoEventAt: state.lastDemoEventAt ?? null,
      lastError: state.lastError ?? null,
      lastErrorAt: state.lastErrorAt ?? null,
      lastTestAt: state.lastTestAt ?? null,
      lastTestOk: state.lastTestOk ?? null,
      lastTestDetail: state.lastTestDetail ?? null,
    },
    recentEvents: events.filter((e) => e.id !== "healthcheck").map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      status: e.status,
      summary: e.summary,
      error: e.error,
      isDemo: e.isDemo,
    })),
  };
}

async function graph(path: string): Promise<Record<string, any>> {
  const response = await fetch(`https://graph.facebook.com/${env.whatsapp.graphVersion}/${path}`, {
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    // Meta's error text is safe to show; the token itself is never included.
    throw new Error(body?.error?.message ?? `Graph API answered ${response.status}`);
  }
  return body;
}

/** Calls the Graph API with the configured credentials and stores the outcome. */
export async function testConnection(actorName: string) {
  const config = whatsappConfig();
  const now = new Date().toISOString();
  let ok = false;
  let detail: Record<string, unknown>;

  if (!config.canCallApi) {
    detail = { error: "missing_credentials", missing: config.missing };
  } else {
    try {
      const phone = await graph(
        `${encodeURIComponent(env.whatsapp.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,is_on_biz_app`,
      );
      detail = {
        displayPhoneNumber: phone.display_phone_number ?? null,
        verifiedName: phone.verified_name ?? null,
        qualityRating: phone.quality_rating ?? null,
        platformType: phone.platform_type ?? null,
        // true + CLOUD_API means the number works with both the app and the Cloud API (Coexistence).
        isOnBizApp: phone.is_on_biz_app ?? null,
      };
      if (env.whatsapp.businessAccountId) {
        try {
          const waba = await graph(`${encodeURIComponent(env.whatsapp.businessAccountId)}?fields=name,timezone_id`);
          detail.businessAccountName = waba.name ?? null;
          const apps = await graph(`${encodeURIComponent(env.whatsapp.businessAccountId)}/subscribed_apps`);
          detail.subscribedApps = Array.isArray(apps.data) ? apps.data.length : 0;
        } catch (error) {
          detail.businessAccountError = error instanceof Error ? error.message : "Could not read the business account";
        }
      }
      ok = true;
    } catch (error) {
      detail = { error: error instanceof Error ? error.message : "Connection test failed" };
    }
  }

  await db.update("integration", "whatsapp", {
    lastTestAt: now,
    lastTestOk: config.canCallApi ? ok : null,
    lastTestDetail: detail,
  });
  await logActivity({
    actor: { id: null, name: actorName, type: "system" },
    action: "integration_event",
    entityType: "integration",
    entityId: "whatsapp",
    description: ok ? "WhatsApp connection test succeeded" : "WhatsApp connection test failed",
    meta: { ok },
  });
  return { ok, detail };
}
