import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Eye, MessageCircle, Plus, Search, Ticket } from "lucide-react";
import { api, ApiError, errorMessage } from "~/crm/api";
import { AssignTripModal, TripBadge, tripOf, type LeadTrip, type TripStatus } from "~/crm/assign-trip";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { SERVICE_TYPES } from "~/lib/constants";
import { cn, formatDate, leadName, timeAgo } from "~/lib/format";
import { formatPhone } from "~/lib/phone";
import type { Lead } from "~/lib/types";
import { Avatar, DemoBadge, EmptyState, Field, Modal, PageHeader, Segmented, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";

/**
 * WhatsApp Leads: one list, two actions per customer (View, Assign to trip).
 * The status is derived from the records (assigned trip, booking, departure), never set by hand.
 */
type Show = "todo" | "assigned" | "booked" | "all";
const SHOWS: Show[] = ["todo", "assigned", "booked", "all"];
const matches = (show: Show, status: TripStatus) =>
  show === "all" || (show === "todo" ? status === "none" : status === show);

export default function LeadsPage() {
  const { t } = useI18n();
  const { data, can } = useCrm();
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Lead | null>(null);
  const show: Show = SHOWS.includes(params.get("show") as Show) ? (params.get("show") as Show) : "todo";
  const query = params.get("q") ?? "";
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return data.leads
      .map((lead) => ({ lead, trip: tripOf(lead, data.bookings) }))
      .filter(({ lead }) => {
        if (!q) return true;
        const text = `${leadName(lead)} ${lead.waName ?? ""} ${lead.displayName ?? ""}`.toLowerCase();
        const phone = (lead.phone ?? "").replace(/\D/g, "");
        return text.includes(q) || (digits.length >= 3 && phone.includes(digits));
      })
      .sort((a, b) => b.lead.lastActivityAt.localeCompare(a.lead.lastActivityAt));
  }, [data.leads, data.bookings, query]);
  const counts = useMemo(
    () => Object.fromEntries(SHOWS.map((s) => [s, rows.filter((r) => matches(s, r.trip.status)).length])) as Record<Show, number>,
    [rows],
  );
  const visible = rows.filter((r) => matches(show, r.trip.status));

  return (
    <PageBody>
      <PageHeader
        title={t("crm.leads.title")}
        subtitle={t("crm.leads.simpleSubtitle")}
        actions={
          can("leads.create") && (
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("crm.leads.new")}
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-navy-400 pointer-events-none" />
          <input type="search" value={query} onChange={(e) => setParam("q", e.target.value)} placeholder={t("crm.leads.searchPlaceholder")} aria-label={t("crm.leads.searchPlaceholder")} className="input ps-9" />
        </div>
        <Segmented<Show>
          value={show}
          onChange={(v) => setParam("show", v === "todo" ? "" : v)}
          options={SHOWS.map((s) => ({ value: s, label: t(`crm.leads.show.${s}`), count: counts[s] }))}
        />
      </div>

      {data.leads.length === 0 ? (
        <div className="panel"><EmptyState icon={MessageCircle} title={t("crm.leads.empty")} hint={t("crm.leads.emptyHint")} /></div>
      ) : visible.length === 0 ? (
        <div className="panel"><EmptyState icon={Search} title={t(show === "todo" && !query ? "crm.leads.allAssigned" : "crm.leads.emptyFiltered")} /></div>
      ) : (
        <ul className="panel divide-y divide-[var(--line)] overflow-hidden">
          {visible.map(({ lead, trip }) => <LeadRow key={lead.id} lead={lead} trip={trip} onAssign={() => setAssignFor(lead)} />)}
        </ul>
      )}

      {assignFor && (
        <AssignTripModal
          lead={assignFor}
          onClose={() => setAssignFor(null)}
          initial={assignFor.departureId ? { departureId: assignFor.departureId, travelers: assignFor.tripTravelers } : undefined}
        />
      )}
      <CreateLeadModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageBody>
  );
}

function LeadRow({ lead, trip, onAssign }: { lead: Lead; trip: LeadTrip; onAssign: () => void }) {
  const { t, locale } = useI18n();
  const { staffById, packageById, departureById, openLead, highlighted } = useCrm();
  const assignee = lead.assignedTo ? staffById.get(lead.assignedTo) : null;
  const departure = trip.departureId ? departureById.get(trip.departureId) : undefined;
  const pkg = departure ? packageById.get(departure.packageId) : undefined;
  const unread = lead.unreadCount > 0;
  const canAssign = trip.status !== "booked";
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", highlighted.has(lead.id) && "bg-emerald-50")} data-lead={lead.id}>
      <button type="button" onClick={() => openLead(lead.id)} className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-start">
        <span className="relative shrink-0">
          <Avatar name={leadName(lead)} />
          {unread && <span className="absolute -top-0.5 -end-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold" dir="auto">{leadName(lead)}</span>
            <DemoBadge show={lead.isDemo} />
          </span>
          <span className="block text-xs muted ltr-inline">{formatPhone(lead.phone) || "—"}</span>
          <span className={cn("block truncate text-[13px] max-w-md", unread ? "font-medium text-navy-900" : "muted")} dir="auto">
            {unread && <span className="me-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">{t("crm.leads.newMessage")}</span>}
            {lead.lastMessageText ?? t("crm.leads.noMessage")}
          </span>
        </span>
      </button>

      <div className="min-w-0 basis-48 grow sm:grow-0 sm:w-56">
        <TripBadge status={trip.status} />
        {pkg && <p className="mt-1 truncate text-[13px] font-medium" dir="auto">{pkg.name}</p>}
        {departure && <p className="text-xs muted">{formatDate(departure.departDate, locale)}</p>}
      </div>

      <div className="hidden md:flex w-32 items-center gap-1.5 text-[13px]">
        {assignee ? (
          <>
            <Avatar name={assignee.name} size="sm" />
            <span className="truncate">{assignee.name}</span>
          </>
        ) : (
          <span className="font-medium text-amber-700">{t("crm.common.unassigned")}</span>
        )}
      </div>
      <span className="hidden lg:block w-20 text-xs muted whitespace-nowrap">{timeAgo(lead.lastActivityAt, locale)}</span>

      <div className="flex items-center gap-2 ms-auto">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openLead(lead.id)}>
          <Eye className="size-3.5" />
          {t("crm.leads.view")}
        </button>
        {canAssign && (
          <button type="button" className={cn("btn btn-sm", trip.status === "none" ? "btn-primary" : "btn-secondary")} onClick={onAssign}>
            <Ticket className="size-3.5" />
            {t("crm.trip.assign")}
          </button>
        )}
      </div>
    </li>
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
