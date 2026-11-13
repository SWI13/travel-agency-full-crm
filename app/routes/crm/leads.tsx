import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ArrowRightLeft, CalendarClock, Flag, Kanban, List, MessageCircle, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { api, ApiError, errorMessage, PRIORITY_TONE, SOURCE_TONE, STAGE_COLOR, STAGE_TONE } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { LEAD_SOURCES, LEAD_STAGES, PRIORITIES, SERVICE_TYPES, type LeadStage } from "~/lib/constants";
import { cn, dayKey, formatDateTime, leadName, timeAgo } from "~/lib/format";
import { formatPhone } from "~/lib/phone";
import type { Lead } from "~/lib/types";
import { Avatar, Badge, DemoBadge, EmptyState, Field, Modal, PageHeader, Segmented, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";

type View = "kanban" | "table";
const FILTER_KEYS = ["stage", "service", "agent", "source", "priority", "created"] as const;

function useLeadFilters() {
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? "";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const clear = () => {
    const next = new URLSearchParams(params);
    for (const key of [...FILTER_KEYS, "q"]) next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const active = FILTER_KEYS.filter((key) => params.get(key)).length;
  return { get, set, clear, active, view: (params.get("view") === "table" ? "table" : "kanban") as View };
}

export default function LeadsPage() {
  const { t } = useI18n();
  const { data, can } = useCrm();
  const filters = useLeadFilters();
  const [showFilters, setShowFilters] = useState(filters.active > 0);
  const [createOpen, setCreateOpen] = useState(false);
  const query = filters.get("q");

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const today = dayKey(new Date());
    const since = (days: number) => dayKey(new Date(Date.now() - (days - 1) * 86_400_000));
    const stage = filters.get("stage");
    const service = filters.get("service");
    const agent = filters.get("agent");
    const source = filters.get("source");
    const priority = filters.get("priority");
    const created = filters.get("created");
    return data.leads
      .filter((lead) => {
        if (stage && lead.stage !== stage) return false;
        if (service && lead.serviceType !== service) return false;
        if (agent === "none" ? lead.assignedTo : agent && lead.assignedTo !== agent) return false;
        if (source && lead.source !== source) return false;
        if (priority && lead.priority !== priority) return false;
        if (created === "today" && dayKey(lead.createdAt) !== today) return false;
        if (created === "7" && dayKey(lead.createdAt) < since(7)) return false;
        if (created === "30" && dayKey(lead.createdAt) < since(30)) return false;
        if (q) {
          const text = `${leadName(lead)} ${lead.waName ?? ""} ${lead.displayName ?? ""}`.toLowerCase();
          const phone = (lead.phone ?? "").replace(/\D/g, "");
          if (!text.includes(q) && !(digits.length >= 3 && phone.includes(digits))) return false;
        }
        return true;
      })
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }, [data.leads, query, filters]);

  const filtered = filters.active > 0 || !!query;

  return (
    <PageBody>
      <PageHeader
        title={t("crm.leads.title")}
        subtitle={t("crm.leads.subtitle")}
        actions={
          can("leads.create") && (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("crm.leads.new")}
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-navy-400 pointer-events-none" />
          <input type="search" value={query} onChange={(e) => filters.set("q", e.target.value)} placeholder={t("crm.leads.searchPlaceholder")} aria-label={t("crm.leads.searchPlaceholder")} className="input ps-9" />
        </div>
        <button type="button" className={cn("btn btn-secondary", showFilters && "!border-emerald-500 !text-emerald-700")} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <SlidersHorizontal className="size-4" />
          {t("crm.leads.filters")}
          {filters.active > 0 && <span className="tabular text-[11px] px-1.5 rounded-full bg-emerald-600 text-white">{filters.active}</span>}
        </button>
        {filtered && (
          <button type="button" className="btn btn-ghost" onClick={filters.clear}>
            <X className="size-4" />
            {t("crm.leads.clearFilters")}
          </button>
        )}
        <span className="text-sm muted tabular">{t("crm.leads.count", { n: leads.length })}</span>
        <Segmented<View>
          className="ms-auto"
          value={filters.view}
          onChange={(view) => filters.set("view", view === "kanban" ? "" : view)}
          options={[
            { value: "kanban", label: t("crm.leads.kanban"), icon: Kanban },
            { value: "table", label: t("crm.leads.table"), icon: List },
          ]}
        />
      </div>

      {showFilters && (
        <div className="panel p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 animate-fade-in">
          <FilterSelect label={t("crm.leads.fStage")} value={filters.get("stage")} onChange={(v) => filters.set("stage", v)} options={LEAD_STAGES.map((s) => [s, t(`crm.stage.${s}`)])} />
          <FilterSelect label={t("crm.leads.fService")} value={filters.get("service")} onChange={(v) => filters.set("service", v)} options={SERVICE_TYPES.map((s) => [s, t(`crm.service.${s}`)])} />
          <FilterSelect
            label={t("crm.leads.fAgent")}
            value={filters.get("agent")}
            onChange={(v) => filters.set("agent", v)}
            options={[["none", t("crm.common.unassigned")], ...data.staff.filter((s) => s.isActive).map((s) => [s.id, s.name] as [string, string])]}
          />
          <FilterSelect label={t("crm.leads.fSource")} value={filters.get("source")} onChange={(v) => filters.set("source", v)} options={LEAD_SOURCES.map((s) => [s, t(`crm.source.${s}`)])} />
          <FilterSelect label={t("crm.leads.fPriority")} value={filters.get("priority")} onChange={(v) => filters.set("priority", v)} options={PRIORITIES.map((p) => [p, t(`crm.priority.${p}`)])} />
          <FilterSelect
            label={t("crm.leads.fDate")}
            value={filters.get("created")}
            onChange={(v) => filters.set("created", v)}
            allLabel={t("crm.leads.dateAny")}
            options={[["today", t("crm.leads.dateToday")], ["7", t("crm.leads.date7")], ["30", t("crm.leads.date30")]]}
          />
        </div>
      )}

      {data.leads.length === 0 ? (
        <div className="panel">
          <EmptyState icon={MessageCircle} title={t("crm.leads.empty")} hint={t("crm.leads.emptyHint")} />
        </div>
      ) : leads.length === 0 ? (
        <div className="panel">
          <EmptyState icon={Search} title={t("crm.leads.emptyFiltered")} action={<button type="button" className="btn btn-secondary" onClick={filters.clear}>{t("crm.leads.clearFilters")}</button>} />
        </div>
      ) : filters.view === "kanban" ? (
        <KanbanBoard leads={leads} onlyStage={filters.get("stage") as LeadStage | ""} />
      ) : (
        <LeadTable leads={leads} />
      )}

      <CreateLeadModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageBody>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<readonly [string, string]>;
  allLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className={cn("input", value && "!border-emerald-500")} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel ?? t("crm.common.all")}</option>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

/** Moves a lead to another stage; "Lost" asks for the reason first. */
function useStageMove() {
  const { t } = useI18n();
  const { apply } = useCrm();
  const toast = useToast();
  const [lostFor, setLostFor] = useState<Lead | null>(null);

  const commit = async (lead: Lead, stage: LeadStage, lostReason?: string) => {
    const optimistic: Lead = { ...lead, stage };
    apply("leads", optimistic); // the card moves immediately; the server confirms below
    try {
      apply("leads", await api<Lead>("leads.update", { id: lead.id, patch: lostReason ? { stage, lostReason } : { stage } }));
    } catch (error) {
      apply("leads", lead);
      toast.error(errorMessage(t, error));
    }
  };
  const move = (lead: Lead, stage: LeadStage) => {
    if (lead.stage === stage) return;
    if (stage === "lost" && !lead.lostReason) setLostFor(lead);
    else void commit(lead, stage);
  };

  const dialog = (
    <Modal open={!!lostFor} onClose={() => setLostFor(null)} title={t("crm.leads.lost.title")} subtitle={lostFor ? leadName(lostFor) : undefined} size="sm">
      <form
        className="grid gap-4"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
          if (!reason || !lostFor) return;
          void commit(lostFor, "lost", reason);
          setLostFor(null);
        }}
      >
        <input name="reason" required maxLength={300} className="input" placeholder={t("crm.leads.lost.placeholder")} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setLostFor(null)}>{t("crm.common.cancel")}</button>
          <button type="submit" className="btn btn-danger">{t("crm.leads.lost.confirm")}</button>
        </div>
      </form>
    </Modal>
  );
  return { move, dialog };
}

function KanbanBoard({ leads, onlyStage }: { leads: Lead[]; onlyStage: LeadStage | "" }) {
  const { t } = useI18n();
  const { leadById } = useCrm();
  const { move, dialog } = useStageMove();
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const stages = onlyStage ? [onlyStage] : LEAD_STAGES;
  const byStage = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>();
    for (const lead of leads) map.set(lead.stage, [...(map.get(lead.stage) ?? []), lead]);
    return map;
  }, [leads]);

  const onDrop = (event: DragEvent, stage: LeadStage) => {
    event.preventDefault();
    setDragOver(null);
    const lead = leadById.get(event.dataTransfer.getData("text/lead-id"));
    if (lead) move(lead, stage);
  };

  return (
    <>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto scroll-thin pb-4">
        <div className="flex gap-4 min-w-max items-start">
          {stages.map((stage) => {
            const items = byStage.get(stage) ?? [];
            return (
              <section
                key={stage}
                aria-label={t(`crm.stage.${stage}`)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOver(stage);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null);
                }}
                onDrop={(event) => onDrop(event, stage)}
                className={cn(
                  "w-[19rem] shrink-0 rounded-2xl bg-navy-900/[0.035] border border-transparent transition-colors",
                  dragOver === stage && "border-emerald-400 bg-emerald-50",
                )}
              >
                <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
                  <span className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
                  <h2 className="text-[13px] font-bold text-navy-800">{t(`crm.stage.${stage}`)}</h2>
                  <span className="ms-auto tabular text-xs font-semibold muted bg-white rounded-full px-2 py-0.5 border border-[var(--line)]">{items.length}</span>
                </header>
                <div className="px-2 pb-2 grid gap-2 max-h-[calc(100dvh-19rem)] min-h-24 overflow-y-auto scroll-thin content-start">
                  {items.length === 0 && <p className="text-center text-xs muted py-6">{t("crm.leads.colEmpty")}</p>}
                  {items.map((lead) => <LeadCard key={lead.id} lead={lead} onMove={move} />)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {dialog}
    </>
  );
}

function FollowUpChip({ lead }: { lead: Lead }) {
  const { t, locale } = useI18n();
  if (!lead.nextFollowUpAt) return null;
  const overdue = new Date(lead.nextFollowUpAt).getTime() < Date.now();
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", overdue ? "text-rose-700" : "text-navy-500")} title={`${t("crm.leads.followUp")}: ${formatDateTime(lead.nextFollowUpAt, locale)}`}>
      <CalendarClock className="size-3.5" />
      {overdue ? t("crm.leads.overdue") : formatDateTime(lead.nextFollowUpAt, locale)}
    </span>
  );
}

function LeadCard({ lead, onMove }: { lead: Lead; onMove: (lead: Lead, stage: LeadStage) => void }) {
  const { t, locale } = useI18n();
  const { staffById, openLead, highlighted } = useCrm();
  const assignee = lead.assignedTo ? staffById.get(lead.assignedTo) : null;
  const unread = lead.unreadCount > 0;
  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/lead-id", lead.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group relative rounded-xl bg-white border border-[var(--line)] p-3 shadow-[0_1px_2px_rgb(17_26_48/0.04)] cursor-grab active:cursor-grabbing transition-shadow hover:shadow-soft",
        unread && "border-emerald-300",
        highlighted.has(lead.id) && "animate-pulse-ring",
      )}
    >
      <button type="button" onClick={() => openLead(lead.id)} className="block w-full text-start">
        <span className="flex items-start gap-2.5">
          <Avatar name={leadName(lead)} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-sm truncate" dir="auto">{leadName(lead)}</span>
              <DemoBadge show={lead.isDemo} />
            </span>
            <span className="block text-xs muted ltr-inline">{formatPhone(lead.phone) || "—"}</span>
          </span>
          {unread && (
            <span className="shrink-0 tabular text-[10px] font-bold px-1.5 h-[18px] grid place-items-center rounded-full bg-emerald-500 text-white" title={t("crm.leads.newMessage")}>
              {lead.unreadCount}
            </span>
          )}
        </span>
        <span className={cn("mt-2 block text-[13px] leading-snug line-clamp-2", unread ? "text-navy-900 font-medium" : "muted")} dir="auto">
          {lead.lastMessageText ?? t("crm.leads.noMessage")}
        </span>
        {unread && <span className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wider text-emerald-700">{t("crm.leads.newMessage")}</span>}
        <span className="mt-2 flex flex-wrap gap-1">
          <Badge tone={lead.serviceType === "unknown" ? "neutral" : "gold"}>{t(`crm.service.${lead.serviceType}`)}</Badge>
          <Badge tone={SOURCE_TONE[lead.source]}>{t(`crm.source.${lead.source}`)}</Badge>
          {(lead.priority === "high" || lead.priority === "urgent") && (
            <Badge tone={PRIORITY_TONE[lead.priority]}><Flag className="size-3" />{t(`crm.priority.${lead.priority}`)}</Badge>
          )}
        </span>
      </button>
      <footer className="mt-2.5 pt-2.5 border-t border-[var(--line)] flex items-center gap-2">
        <FollowUpChip lead={lead} />
        <span className="ms-auto text-[11px] muted whitespace-nowrap">{timeAgo(lead.lastActivityAt, locale)}</span>
        {assignee ? <Avatar name={assignee.name} size="sm" /> : <span className="text-[11px] font-medium text-amber-700">{t("crm.common.unassigned")}</span>}
        {/* Keyboard- and touch-friendly alternative to drag and drop */}
        <span className="relative grid place-items-center size-6 rounded-md text-navy-400 hover:bg-sand-100 hover:text-navy-900">
          <ArrowRightLeft className="size-3.5" />
          <select aria-label={t("crm.leads.moveTo")} title={t("crm.leads.moveTo")} value={lead.stage} onChange={(e) => onMove(lead, e.target.value as LeadStage)} className="absolute inset-0 opacity-0 cursor-pointer">
            {LEAD_STAGES.map((s) => <option key={s} value={s}>{t(`crm.stage.${s}`)}</option>)}
          </select>
        </span>
      </footer>
    </article>
  );
}

function LeadTable({ leads }: { leads: Lead[] }) {
  const { t, locale } = useI18n();
  const { staffById, openLead, highlighted } = useCrm();
  return (
    <div className="panel overflow-x-auto scroll-thin">
      <table className="data-table min-w-[64rem]">
        <thead>
          <tr>
            <th>{t("crm.leads.th.customer")}</th>
            <th>{t("crm.leads.th.lastMessage")}</th>
            <th>{t("crm.leads.th.service")}</th>
            <th>{t("crm.leads.th.stage")}</th>
            <th>{t("crm.leads.th.agent")}</th>
            <th>{t("crm.leads.th.source")}</th>
            <th>{t("crm.leads.th.priority")}</th>
            <th>{t("crm.leads.th.followUp")}</th>
            <th>{t("crm.leads.th.activity")}</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const assignee = lead.assignedTo ? staffById.get(lead.assignedTo) : null;
            return (
              <tr key={lead.id} onClick={() => openLead(lead.id)} className={cn("cursor-pointer", highlighted.has(lead.id) && "!bg-emerald-50")}>
                <td>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="relative">
                      <Avatar name={leadName(lead)} />
                      {lead.unreadCount > 0 && <span className="absolute -top-0.5 -end-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0">
                      <button type="button" className="flex items-center gap-1.5 font-semibold hover:text-emerald-700" onClick={(e) => { e.stopPropagation(); openLead(lead.id); }}>
                        <span className="truncate max-w-44" dir="auto">{leadName(lead)}</span>
                        <DemoBadge show={lead.isDemo} />
                      </button>
                      <span className="block text-xs muted ltr-inline">{formatPhone(lead.phone)}</span>
                    </span>
                  </span>
                </td>
                <td className="max-w-64">
                  <span className={cn("block truncate", lead.unreadCount > 0 ? "font-medium" : "muted")} dir="auto">{lead.lastMessageText ?? "—"}</span>
                  {lead.unreadCount > 0 && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{t("crm.leads.newMessage")} · {lead.unreadCount}</span>}
                </td>
                <td><Badge tone={lead.serviceType === "unknown" ? "neutral" : "gold"}>{t(`crm.service.${lead.serviceType}`)}</Badge></td>
                <td><Badge tone={STAGE_TONE[lead.stage]} dot>{t(`crm.stage.${lead.stage}`)}</Badge></td>
                <td>
                  {assignee ? (
                    <span className="flex items-center gap-2"><Avatar name={assignee.name} size="sm" /><span className="truncate max-w-28">{assignee.name}</span></span>
                  ) : (
                    <span className="text-amber-700 text-[13px] font-medium">{t("crm.common.unassigned")}</span>
                  )}
                </td>
                <td><Badge tone={SOURCE_TONE[lead.source]}>{t(`crm.source.${lead.source}`)}</Badge></td>
                <td><Badge tone={PRIORITY_TONE[lead.priority]}>{t(`crm.priority.${lead.priority}`)}</Badge></td>
                <td>{lead.nextFollowUpAt ? <FollowUpChip lead={lead} /> : <span className="muted">—</span>}</td>
                <td className="muted whitespace-nowrap">{timeAgo(lead.lastActivityAt, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { data, can, apply, openLead } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; existingId?: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const lead = await api<Lead>("leads.create", {
        phone: String(form.get("phone")),
        name: String(form.get("name") ?? "") || null,
        serviceType: form.get("serviceType"),
        note: String(form.get("note") ?? "") || null,
        assignedTo: String(form.get("assignedTo") ?? "") || null,
      });
      apply("leads", lead);
      toast.success(t("crm.common.saved"));
      onClose();
      openLead(lead.id);
    } catch (err) {
      const existingId = err instanceof ApiError && err.code === "lead_exists" ? String(err.details?.id ?? "") : undefined;
      setError({ message: errorMessage(t, err), existingId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("crm.leads.create.title")} subtitle={t("crm.leads.create.hint")}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label={t("crm.leads.create.phone")} className="col-span-2 sm:col-span-1">
          <input name="phone" type="tel" dir="ltr" required className="input" placeholder="0661 23 45 67" />
        </Field>
        <Field label={t("crm.leads.create.name")} className="col-span-2 sm:col-span-1" optional>
          <input name="name" className="input" maxLength={160} />
        </Field>
        <Field label={t("crm.leads.create.service")}>
          <select name="serviceType" className="input" defaultValue="unknown">
            {SERVICE_TYPES.map((s) => <option key={s} value={s}>{t(`crm.service.${s}`)}</option>)}
          </select>
        </Field>
        {can("leads.assign") && (
          <Field label={t("crm.leads.create.assign")}>
            <select name="assignedTo" className="input" defaultValue="">
              <option value="">{t("crm.common.unassigned")}</option>
              {data.staff.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t("crm.leads.create.note")} className="col-span-2" optional>
          <textarea name="note" rows={2} className="input" maxLength={1000} />
        </Field>
        {error && (
          <p role="alert" className="col-span-2 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2.5">
            {error.message}{" "}
            {error.existingId && (
              <button type="button" className="font-semibold underline" onClick={() => { onClose(); openLead(error.existingId!); }}>
                {t("crm.leads.create.openExisting")}
              </button>
            )}
          </p>
        )}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {t("crm.leads.create.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
