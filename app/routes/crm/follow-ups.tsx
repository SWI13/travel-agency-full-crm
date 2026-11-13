import { useMemo, useState } from "react";
import { CalendarCheck, CalendarClock, Check, ChevronDown, TriangleAlert, Undo2 } from "lucide-react";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { cn, dayKey, formatDate, formatDateTime, leadName, timeAgo, toLocalInput } from "~/lib/format";
import type { FollowUp } from "~/lib/types";
import { Avatar, Badge, DemoBadge, EmptyState, PageHeader, Segmented } from "~/ui";
import { useToast } from "~/ui/feedback";

type Scope = "mine" | "all";

export default function FollowUpsPage() {
  const { t } = useI18n();
  const { data, can } = useCrm();
  const [scope, setScope] = useState<Scope>("all");
  const [showDone, setShowDone] = useState(false);

  const groups = useMemo(() => {
    const now = Date.now();
    const today = dayKey(new Date());
    const list = data.followups.filter((f) => scope === "all" || f.assignedTo === data.me.id);
    const pending = list.filter((f) => f.status === "pending").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      overdue: pending.filter((f) => new Date(f.dueAt).getTime() < now && dayKey(f.dueAt) !== today),
      today: pending.filter((f) => dayKey(f.dueAt) === today),
      upcoming: pending.filter((f) => new Date(f.dueAt).getTime() >= now && dayKey(f.dueAt) !== today),
      completed: list.filter((f) => f.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 50),
    };
  }, [data.followups, data.me.id, scope]);

  const none = data.followups.length === 0;

  return (
    <PageBody>
      <PageHeader
        title={t("crm.followups.title")}
        subtitle={t("crm.followups.subtitle")}
        actions={
          can("leads.view_all") && (
            <Segmented<Scope> value={scope} onChange={setScope} options={[{ value: "all", label: t("crm.followups.everyone") }, { value: "mine", label: t("crm.followups.mine") }]} />
          )
        }
      />

      {none ? (
        <div className="panel"><EmptyState icon={CalendarClock} title={t("crm.followups.empty")} hint={t("crm.followups.emptyHint")} /></div>
      ) : (
        <div className="grid gap-8 max-w-4xl">
          <Group title={t("crm.followups.overdue")} items={groups.overdue} tone="rose" icon={TriangleAlert} hideWhenEmpty />
          <Group title={t("crm.followups.today")} items={groups.today} tone="emerald" icon={CalendarCheck} />
          <Group title={t("crm.followups.upcoming")} items={groups.upcoming} tone="navy" icon={CalendarClock} />
          <section>
            <button type="button" className="flex items-center gap-2 text-sm font-semibold muted hover:text-navy-900" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} />
              {t("crm.followups.completed")} · {groups.completed.length}
            </button>
            {showDone && (
              <ul className="mt-3 grid gap-2">
                {groups.completed.length === 0 && <li className="text-sm muted">{t("crm.followups.sectionEmpty")}</li>}
                {groups.completed.map((f) => <Row key={f.id} followUp={f} />)}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageBody>
  );
}

function Group({ title, items, tone, icon: Icon, hideWhenEmpty }: {
  title: string;
  items: FollowUp[];
  tone: "rose" | "emerald" | "navy";
  icon: typeof CalendarClock;
  hideWhenEmpty?: boolean;
}) {
  const { t } = useI18n();
  if (hideWhenEmpty && items.length === 0) return null;
  const overdue = tone === "rose";
  return (
    <section className={cn(overdue && "rounded-2xl border border-rose-200 bg-rose-50/70 p-4 -mx-1")}>
      <h2 className={cn("flex items-center gap-2 font-display text-lg font-semibold mb-3", overdue && "text-rose-800")}>
        <Icon className={cn("size-5", tone === "rose" ? "text-rose-600" : tone === "emerald" ? "text-emerald-600" : "text-navy-400")} />
        {title}
        <span className={cn("tabular text-xs font-bold font-sans px-2 py-0.5 rounded-full", overdue ? "bg-rose-600 text-white" : "bg-navy-900/[0.07] text-navy-700")}>{items.length}</span>
      </h2>
      {items.length === 0 ? <p className="text-sm muted">{t("crm.followups.sectionEmpty")}</p> : <ul className="grid gap-2">{items.map((f) => <Row key={f.id} followUp={f} overdue={overdue} />)}</ul>}
    </section>
  );
}

function Row({ followUp, overdue }: { followUp: FollowUp; overdue?: boolean }) {
  const { t, locale } = useI18n();
  const { leadById, staffById, apply, openLead } = useCrm();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const lead = leadById.get(followUp.leadId);
  const assignee = followUp.assignedTo ? staffById.get(followUp.assignedTo) : null;
  const done = followUp.status === "done";

  const update = async (patch: { done?: boolean; dueAt?: string }) => {
    setMenu(false);
    try {
      apply("followups", await api<FollowUp>("followups.update", { id: followUp.id, ...patch }));
    } catch (error) {
      toast.error(errorMessage(t, error));
    }
  };
  /** Same time of day, n days from today. */
  const inDays = (days: number) => {
    const original = new Date(followUp.dueAt);
    const next = new Date();
    next.setDate(next.getDate() + days);
    next.setHours(original.getHours(), original.getMinutes(), 0, 0);
    return next.toISOString();
  };

  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white border px-4 py-3", overdue ? "border-rose-200" : "border-[var(--line)]", done && "opacity-70")}>
      <button type="button" disabled={!lead} onClick={() => lead && openLead(lead.id)} className="flex items-center gap-3 min-w-0 flex-1 text-start">
        <Avatar name={lead ? leadName(lead) : "?"} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate" dir="auto">{lead ? leadName(lead) : "—"}</span>
            <DemoBadge show={followUp.isDemo} />
          </span>
          <span className="block text-[13px] muted truncate">
            {t(`crm.reason.${followUp.reason}`)}
            {followUp.notes ? ` — ${followUp.notes}` : ""}
          </span>
        </span>
      </button>

      <span className="text-[13px] whitespace-nowrap">
        {done ? (
          <span className="muted">{t("crm.followups.completedOn", { date: formatDate(followUp.completedAt, locale) })}</span>
        ) : (
          <>
            <span className={cn("font-semibold", overdue && "text-rose-700")}>{formatDateTime(followUp.dueAt, locale)}</span>
            {overdue && <span className="block text-xs text-rose-600">{timeAgo(followUp.dueAt, locale)}</span>}
          </>
        )}
      </span>
      {assignee ? <Avatar name={assignee.name} size="sm" /> : <Badge tone="amber">{t("crm.common.unassigned")}</Badge>}

      <span className="flex items-center gap-1.5">
        {done ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ done: false })}>
            <Undo2 className="size-3.5" />
            {t("crm.followups.reopen")}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => update({ done: true })}>
              <Check className="size-3.5" />
              {t("crm.followups.done")}
            </button>
            <span className="relative">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
                {t("crm.followups.reschedule")}
                <ChevronDown className="size-3.5" />
              </button>
              {menu && (
                <>
                  <span className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />
                  <span className="absolute z-50 top-full end-0 mt-1 w-56 rounded-xl bg-white border border-[var(--line)] shadow-lift p-1.5 grid animate-pop" role="menu">
                    {(
                      [
                        [t("crm.followups.tomorrow"), 1],
                        [t("crm.followups.in3days"), 3],
                        [t("crm.followups.nextWeek"), 7],
                      ] as Array<[string, number]>
                    ).map(([label, days]) => (
                      <button key={days} type="button" role="menuitem" className="text-start px-3 h-9 rounded-lg text-sm hover:bg-sand-100" onClick={() => update({ dueAt: inDays(days) })}>
                        {label}
                      </button>
                    ))}
                    <label className="px-3 pt-2 pb-1.5 border-t border-[var(--line)] mt-1 grid gap-1 text-xs muted">
                      {t("crm.followups.pick")}
                      <input type="datetime-local" className="input h-9" defaultValue={toLocalInput(followUp.dueAt)} onBlur={(e) => e.target.value && e.target.value !== toLocalInput(followUp.dueAt) && update({ dueAt: new Date(e.target.value).toISOString() })} />
                    </label>
                  </span>
                </>
              )}
            </span>
          </>
        )}
      </span>
    </li>
  );
}
