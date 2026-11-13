import type { TFunction } from "~/i18n";
import type { Locale } from "~/lib/constants";
import { formatDateTime, formatDzd } from "~/lib/format";
import type { Activity } from "~/lib/types";

/** Localised one-line detail for an audit entry, built from its structured metadata. */
export function activityText(entry: Activity, t: TFunction, locale: Locale): string {
  const m = entry.meta ?? {};
  const s = (key: string) => (typeof m[key] === "string" ? (m[key] as string) : "");
  const n = (key: string) => (typeof m[key] === "number" ? (m[key] as number) : 0);
  switch (entry.action) {
    case "lead_created":
      return t("crm.activity.text.lead_created", { source: t(`crm.source.${s("source") || "unknown"}`) }) + (s("name") ? ` · ${s("name")}` : "");
    case "message_in":
    case "message_out":
      return t(`crm.activity.text.${entry.action}`, { preview: s("preview") });
    case "lead_assigned":
      return s("toName") ? t("crm.activity.text.assigned", { name: s("toName") }) : t("crm.activity.text.unassigned");
    case "stage_changed":
      return (
        t("crm.activity.text.stage_changed", { from: t(`crm.stage.${s("from")}`), to: t(`crm.stage.${s("to")}`) }) +
        (s("lostReason") ? ` · ${s("lostReason")}` : "")
      );
    case "package_selected":
      return t("crm.activity.text.package_selected", { name: s("packageName") });
    case "booking_created":
      return t("crm.activity.text.booking_created", {
        name: s("packageName"),
        travelers: n("travelers"),
        total: formatDzd(n("totalDzd"), locale),
      });
    case "payment_updated":
      return t("crm.activity.text.payment_updated", {
        paid: formatDzd(n("paidDzd"), locale),
        total: formatDzd(n("totalDzd"), locale),
        status: t(`crm.payment.${s("paymentStatus") || "unpaid"}`),
      });
    case "followup_scheduled":
    case "followup_completed":
    case "followup_rescheduled":
      return s("reason")
        ? t("crm.activity.text.followup", { reason: t(`crm.reason.${s("reason")}`), date: formatDateTime(s("dueAt"), locale) })
        : entry.description;
    case "lead_updated":
    case "settings_updated":
      return Array.isArray(m.fields) ? t("crm.activity.text.fields", { fields: (m.fields as string[]).join(", ") }) : entry.description;
    default:
      return entry.description;
  }
}
