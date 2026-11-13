import { hasTranslation, type TFunction } from "~/i18n";
import type { LeadSource, LeadStage, PaymentStatus, Priority } from "~/lib/constants";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls a server procedure. Permissions and validation are enforced on the server. */
export async function api<T = unknown>(name: string, input: unknown = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Request": "1" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiError("network", "Network error", 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    if (response.status === 401 && !window.location.pathname.endsWith("/sign-in")) {
      window.location.assign("/admin/sign-in");
    }
    throw new ApiError(body?.code ?? "server_error", body?.message ?? "Server error", response.status, body?.details ?? null);
  }
  return body.data as T;
}

/** Localised, human message for any thrown error. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const key = `crm.errors.${error.code}`;
    if (error.code === "invalid_input" && error.message) return error.message;
    return hasTranslation(key) ? t(key) : error.message || t("crm.errors.server_error");
  }
  return t("crm.errors.server_error");
}

// ── Visual vocabulary shared by every screen ────────────────────────────────
export const STAGE_TONE: Record<LeadStage, string> = {
  new: "blue",
  contacted: "violet",
  qualified: "teal",
  package_sent: "gold",
  awaiting_documents: "amber",
  awaiting_deposit: "amber",
  confirmed: "emerald",
  travel_preparation: "emerald",
  completed: "navy",
  lost: "rose",
};

/** Accent used for pipeline column markers and charts. */
export const STAGE_COLOR: Record<LeadStage, string> = {
  new: "#0ea5e9",
  contacted: "#8b5cf6",
  qualified: "#14b8a6",
  package_sent: "#d4b262",
  awaiting_documents: "#f59e0b",
  awaiting_deposit: "#ea8a0c",
  confirmed: "#10b981",
  travel_preparation: "#059669",
  completed: "#1a2540",
  lost: "#e11d48",
};

export const SOURCE_TONE: Record<LeadSource, string> = {
  facebook_ad: "blue",
  instagram_ad: "violet",
  meta_ad: "blue",
  meta_post: "neutral",
  organic: "emerald",
  website_whatsapp: "teal",
  website_form: "teal",
  manual: "neutral",
  unknown: "neutral",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  low: "neutral",
  normal: "neutral",
  high: "amber",
  urgent: "rose",
};

export const PAYMENT_TONE: Record<PaymentStatus, string> = {
  unpaid: "rose",
  partial: "amber",
  paid: "emerald",
  refunded: "neutral",
  cancelled: "neutral",
};
