import { useMemo, useState } from "react";
import { Bot, ScrollText, Search } from "lucide-react";
import { activityText } from "~/crm/activity-text";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { ACTIVITY_ACTIONS, type ActivityAction } from "~/lib/constants";
import { cn, formatDate, formatTime, leadName } from "~/lib/format";
import type { Activity } from "~/lib/types";
import { Avatar, Badge, DemoBadge, EmptyState, PageHeader, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";

const ACTION_TONE: Partial<Record<ActivityAction, string>> = {
  lead_created: "blue",
  message_in: "emerald",
  message_out: "teal",
  lead_assigned: "violet",
  stage_changed: "gold",
  booking_created: "emerald",
  payment_updated: "amber",
  webhook_error: "rose",
  integration_event: "neutral",
  demo_data: "demo",
};

export default function ActivityPage() {
  const { t, locale } = useI18n();
  const { data, leadById, openLead } = useCrm();
  const toast = useToast();
  const [older, setOlder] = useState<Activity[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...data.activity, ...older]
      .filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.activity, older]);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of all) map.set(entry.actorId ?? "system", entry.actorType === "system" ? t("crm.common.system") : entry.actorName);
    return [...map];
  }, [all, t]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((entry) => {
      if (action && entry.action !== action) return false;
      if (actor && (entry.actorId ?? "system") !== actor) return false;
      const day = entry.createdAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      const lead = entry.leadId ? leadById.get(entry.leadId) : null;
      return `${entry.description} ${entry.actorName} ${activityText(entry, t, locale)} ${lead ? leadName(lead) : ""}`.toLowerCase().includes(q);
    });
  }, [all, query, action, actor, from, to, leadById, t, locale]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const before = all[all.length - 1]?.createdAt;
      const batch = await api<Activity[]>("activity.list", { before, limit: 200 });
      setOlder((list) => [...list, ...batch]);
      if (batch.length < 200) setExhausted(true);
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setLoading(false);
    }
  };

  const th = "crm.activity.th";
  return (
    <PageBody>
      <PageHeader title={t("crm.activity.title")} subtitle={t("crm.activity.subtitle")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto] mb-4">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-navy-400 pointer-events-none" />
          <input type="search" className="input ps-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("crm.activity.searchPlaceholder")} aria-label={t("crm.activity.searchPlaceholder")} />
        </div>
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label={t("crm.activity.fAction")}>
          <option value="">{t("crm.activity.allActions")}</option>
          {ACTIVITY_ACTIONS.map((a) => <option key={a} value={a}>{t(`crm.activity.action.${a}`)}</option>)}
        </select>
        <select className="input" value={actor} onChange={(e) => setActor(e.target.value)} aria-label={t("crm.activity.fActor")}>
          <option value="">{t("crm.activity.everyone")}</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label={t("crm.common.from")} title={t("crm.common.from")} />
        <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label={t("crm.common.to")} title={t("crm.common.to")} />
      </div>

      {all.length === 0 ? (
        <div className="panel"><EmptyState icon={ScrollText} title={t("crm.activity.empty")} /></div>
      ) : rows.length === 0 ? (
        <div className="panel"><EmptyState icon={Search} title={t("crm.activity.emptyFiltered")} /></div>
      ) : (
        <div className="panel overflow-x-auto scroll-thin">
          <table className="data-table min-w-[58rem]">
            <thead>
              <tr>
                <th>{t(`${th}.when`)}</th>
                <th>{t(`${th}.actor`)}</th>
                <th>{t(`${th}.action`)}</th>
                <th>{t(`${th}.related`)}</th>
                <th>{t(`${th}.description`)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const lead = entry.leadId ? leadById.get(entry.leadId) : null;
                const system = entry.actorType === "system";
                return (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium">{formatDate(entry.createdAt, locale)}</span>
                      <span className="block text-xs muted tabular">{formatTime(entry.createdAt, locale)}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {system ? <span className="grid place-items-center size-6 rounded-full bg-gold-100 text-gold-600"><Bot className="size-3.5" /></span> : <Avatar name={entry.actorName} size="sm" />}
                        {system && entry.actorName === "System" ? t("crm.common.system") : entry.actorName}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={ACTION_TONE[entry.action] ?? "neutral"}>{t(`crm.activity.action.${entry.action}`)}</Badge>
                        <DemoBadge show={entry.isDemo && entry.action !== "demo_data"} />
                      </span>
                    </td>
                    <td>
                      {lead ? (
                        <button type="button" className="font-medium text-emerald-700 hover:underline truncate max-w-40" onClick={() => openLead(lead.id)} title={t("crm.activity.openLead")}>
                          {leadName(lead)}
                        </button>
                      ) : (
                        <span className="muted capitalize">{entry.leadId ? "—" : entry.entityType}</span>
                      )}
                    </td>
                    <td className={cn("max-w-md", entry.action === "webhook_error" && "text-rose-700")}>
                      <span className="line-clamp-2" dir="auto">{activityText(entry, t, locale)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {all.length >= 300 && !exhausted && (
        <div className="mt-4 text-center">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loading}>
            {loading && <Spinner />}
            {t("crm.common.more")}
          </button>
        </div>
      )}
    </PageBody>
  );
}
