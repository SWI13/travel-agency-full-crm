import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { BookUser, Check, Pencil, ShieldCheck, UsersRound, Wallet } from "lucide-react";
import { api, errorMessage, PAYMENT_TONE } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { PAYMENT_STATUSES, VISA_STATUSES, VOID_PAYMENT_STATUSES, type VisaStatus } from "~/lib/constants";
import { cn, formatDate, formatDzd } from "~/lib/format";
import type { Booking, Pilgrim } from "~/lib/types";
import { Avatar, Badge, DemoBadge, EmptyState, Field, Meter, Modal, PageHeader, Segmented, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";

type Tab = "bookings" | "pilgrims";
const VISA_TONE: Record<VisaStatus, string> = { not_started: "neutral", in_progress: "blue", submitted: "violet", approved: "emerald", rejected: "rose" };

export default function BookingsPage() {
  const { t, locale } = useI18n();
  const { data } = useCrm();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "pilgrims" ? "pilgrims" : "bookings";
  const setTab = (next: Tab) => {
    const copy = new URLSearchParams(params);
    if (next === "bookings") copy.delete("tab");
    else copy.set("tab", next);
    setParams(copy, { replace: true, preventScrollReset: true });
  };

  const totals = useMemo(() => {
    const active = data.bookings.filter((b) => !VOID_PAYMENT_STATUSES.includes(b.paymentStatus));
    const value = active.reduce((sum, b) => sum + b.totalDzd, 0);
    const collected = active.reduce((sum, b) => sum + b.paidDzd, 0);
    return { value, collected, outstanding: value - collected };
  }, [data.bookings]);

  return (
    <PageBody>
      <PageHeader title={t("crm.bookings.title")} subtitle={t("crm.bookings.subtitle")} />

      <dl className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--line)] mb-6">
        {(
          [
            [t("crm.bookings.value"), totals.value, "text-navy-900"],
            [t("crm.bookings.collected"), totals.collected, "text-emerald-700"],
            [t("crm.bookings.outstanding"), totals.outstanding, totals.outstanding > 0 ? "text-amber-700" : "text-navy-900"],
          ] as Array<[string, number, string]>
        ).map(([label, amount, tone]) => (
          <div key={label} className="bg-white px-5 py-4">
            <dt className="text-[13px] muted flex items-center gap-1.5"><Wallet className="size-3.5" />{label}</dt>
            <dd className={cn("mt-1 font-display text-2xl font-semibold tabular", tone)}>{formatDzd(amount, locale)}</dd>
          </div>
        ))}
      </dl>

      <Segmented<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "bookings", label: t("crm.bookings.tabBookings"), icon: BookUser, count: data.bookings.length },
          { value: "pilgrims", label: t("crm.bookings.tabPilgrims"), icon: UsersRound, count: data.pilgrims.length },
        ]}
      />

      {tab === "bookings" ? <BookingsTable /> : <PilgrimsTable />}
    </PageBody>
  );
}

function BookingsTable() {
  const { t, locale } = useI18n();
  const { data, packageById, departureById, staffById, openLead } = useCrm();
  const [editing, setEditing] = useState<Booking | null>(null);
  const rows = useMemo(() => [...data.bookings].sort((a, b) => b.bookingDate.localeCompare(a.bookingDate)), [data.bookings]);
  const th = "crm.bookings.th";

  if (rows.length === 0) {
    return <div className="panel"><EmptyState icon={BookUser} title={t("crm.bookings.empty")} hint={t("crm.bookings.emptyHint")} /></div>;
  }
  return (
    <>
      <div className="panel overflow-x-auto scroll-thin">
        <table className="data-table min-w-[68rem]">
          <thead>
            <tr>
              <th>{t(`${th}.customer`)}</th>
              <th>{t(`${th}.package`)}</th>
              <th>{t(`${th}.departure`)}</th>
              <th className="!text-end">{t(`${th}.travelers`)}</th>
              <th className="!text-end">{t(`${th}.total`)}</th>
              <th className="!text-end">{t(`${th}.paid`)}</th>
              <th className="!text-end">{t(`${th}.remaining`)}</th>
              <th>{t(`${th}.payment`)}</th>
              <th>{t(`${th}.agent`)}</th>
              <th>{t(`${th}.date`)}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const departure = departureById.get(b.departureId);
              const agent = b.assignedTo ? staffById.get(b.assignedTo) : null;
              const remaining = Math.max(0, b.totalDzd - b.paidDzd);
              return (
                <tr key={b.id} className={cn(VOID_PAYMENT_STATUSES.includes(b.paymentStatus) && "opacity-60")}>
                  <td>
                    <button type="button" className="flex items-center gap-2 font-semibold hover:text-emerald-700" onClick={() => openLead(b.leadId)}>
                      <Avatar name={b.customerName} size="sm" />
                      <span className="truncate max-w-40">{b.customerName}</span>
                      <DemoBadge show={b.isDemo} />
                    </button>
                  </td>
                  <td className="max-w-48 truncate">{packageById.get(b.packageId)?.name ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(departure?.departDate, locale)}</td>
                  <td className="text-end tabular">{b.travelers}</td>
                  <td className="text-end tabular whitespace-nowrap">{formatDzd(b.totalDzd, locale)}</td>
                  <td className="text-end tabular whitespace-nowrap text-emerald-700">{formatDzd(b.paidDzd, locale)}</td>
                  <td className={cn("text-end tabular whitespace-nowrap font-semibold", remaining > 0 && "text-amber-700")}>{formatDzd(remaining, locale)}</td>
                  <td><Badge tone={PAYMENT_TONE[b.paymentStatus]} dot>{t(`crm.payment.${b.paymentStatus}`)}</Badge></td>
                  <td>{agent ? <span className="flex items-center gap-1.5"><Avatar name={agent.name} size="sm" /><span className="truncate max-w-24">{agent.name}</span></span> : "—"}</td>
                  <td className="whitespace-nowrap muted">{formatDate(b.bookingDate, locale)}</td>
                  <td className="text-end">
                    <button type="button" className="icon-btn" onClick={() => setEditing(b)} aria-label={t("crm.bookings.edit.title")} title={t("crm.bookings.edit.title")}>
                      <Pencil className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <PaymentForm booking={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PaymentForm({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { apply } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(booking.totalDzd);
  const [paid, setPaid] = useState(booking.paidDzd);
  const isVoid = VOID_PAYMENT_STATUSES.includes(booking.paymentStatus);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status"));
    setBusy(true);
    try {
      const updated = await api<Booking>("bookings.update", {
        id: booking.id,
        totalDzd: total,
        paidDzd: paid,
        // "auto" lets the server derive Unpaid / Partially paid / Paid from the amounts.
        paymentStatus: status === "auto" ? (paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial") : status,
        notes: String(form.get("notes") ?? "") || null,
      });
      apply("bookings", updated);
      toast.success(t("crm.common.saved"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("crm.bookings.edit.title")} subtitle={booking.customerName}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label={t("crm.booking.total")}>
          <input type="number" min={0} step={1000} dir="ltr" required className="input" value={total} onChange={(e) => setTotal(Number(e.target.value))} />
        </Field>
        <Field label={t("crm.booking.paid")}>
          <input type="number" min={0} max={total} step={1000} dir="ltr" required className="input" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
        </Field>
        <p className="col-span-2 -mt-1 rounded-lg bg-sand-100 px-3 py-2 text-sm flex justify-between">
          <span className="muted">{t("crm.booking.remaining")}</span>
          <span className="font-semibold tabular">{formatDzd(Math.max(0, total - paid), locale)}</span>
        </p>
        <Field label={t("crm.bookings.th.payment")} hint={t("crm.bookings.edit.statusHint")} className="col-span-2">
          <select name="status" className="input" defaultValue={isVoid ? booking.paymentStatus : "auto"}>
            <option value="auto">{t("crm.bookings.edit.auto")}</option>
            {PAYMENT_STATUSES.filter((s) => VOID_PAYMENT_STATUSES.includes(s)).map((s) => <option key={s} value={s}>{t(`crm.payment.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t("crm.common.notes")} className="col-span-2" optional>
          <textarea name="notes" rows={2} maxLength={2000} defaultValue={booking.notes ?? ""} className="input" />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {t("crm.common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PilgrimsTable() {
  const { t, locale } = useI18n();
  const { data, departureById, packageById, apply } = useCrm();
  const toast = useToast();
  const items = data.settings.checklistItems;
  const bookingById = useMemo(() => new Map(data.bookings.map((b) => [b.id, b])), [data.bookings]);
  const rows = useMemo(
    () =>
      [...data.pilgrims].sort(
        (a, b) => (departureById.get(a.departureId)?.departDate ?? "").localeCompare(departureById.get(b.departureId)?.departDate ?? "") || a.bookingId.localeCompare(b.bookingId),
      ),
    [data.pilgrims, departureById],
  );
  const th = "crm.bookings.pilgrims.th";

  const update = async (pilgrim: Pilgrim, patch: Partial<Pick<Pilgrim, "checklist" | "visaStatus" | "fullName">>) => {
    apply("pilgrims", { ...pilgrim, ...patch }); // optimistic
    try {
      apply("pilgrims", await api<Pilgrim>("pilgrims.update", { id: pilgrim.id, ...patch }));
    } catch (error) {
      apply("pilgrims", pilgrim);
      toast.error(errorMessage(t, error));
    }
  };

  if (rows.length === 0) {
    return <div className="panel"><EmptyState icon={UsersRound} title={t("crm.bookings.pilgrims.empty")} hint={t("crm.bookings.pilgrims.emptyHint")} /></div>;
  }
  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-[13px] muted">
        <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
        {t("crm.bookings.pilgrims.privacy")}
      </p>
      <div className="panel overflow-x-auto scroll-thin">
        <table className="data-table min-w-[62rem]">
          <thead>
            <tr>
              <th>{t(`${th}.name`)}</th>
              <th>{t(`${th}.departure`)}</th>
              <th>{t(`${th}.checklist`)}</th>
              <th>{t(`${th}.visa`)}</th>
              <th className="w-40">{t(`${th}.progress`)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((pilgrim) => {
              const departure = departureById.get(pilgrim.departureId);
              const booking = bookingById.get(pilgrim.bookingId);
              const done = items.filter((item) => pilgrim.checklist?.[item.key]).length + (pilgrim.visaStatus === "approved" ? 1 : 0);
              const steps = items.length + 1;
              return (
                <tr key={pilgrim.id}>
                  <td>
                    <span className="flex items-center gap-2">
                      <Avatar name={pilgrim.fullName} size="sm" />
                      <input
                        aria-label={t("crm.bookings.pilgrims.rename")}
                        defaultValue={pilgrim.fullName}
                        key={pilgrim.fullName}
                        maxLength={160}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== pilgrim.fullName) void update(pilgrim, { fullName: name });
                          else e.target.value = pilgrim.fullName;
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className="bg-transparent font-semibold w-48 rounded px-1 -mx-1 h-7 hover:bg-sand-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      />
                      <DemoBadge show={pilgrim.isDemo} />
                    </span>
                    {booking && booking.customerName !== pilgrim.fullName && <p className="text-xs muted ms-8">{booking.customerName}</p>}
                  </td>
                  <td className="whitespace-nowrap">
                    <p>{formatDate(departure?.departDate, locale)}</p>
                    <p className="text-xs muted truncate max-w-44">{departure ? packageById.get(departure.packageId)?.name : ""}</p>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5 max-w-md">
                      {items.map((item) => {
                        const on = !!pilgrim.checklist?.[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => update(pilgrim, { checklist: { ...pilgrim.checklist, [item.key]: !on } })}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 h-7 text-xs font-medium transition-colors",
                              on ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-[var(--line)] text-navy-600 hover:border-emerald-400",
                            )}
                          >
                            {on && <Check className="size-3" />}
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <span className="relative inline-flex">
                      <Badge tone={VISA_TONE[pilgrim.visaStatus]} dot className="pe-5">{t(`crm.visa.${pilgrim.visaStatus}`)}</Badge>
                      <select aria-label={t(`${th}.visa`)} value={pilgrim.visaStatus} onChange={(e) => update(pilgrim, { visaStatus: e.target.value as VisaStatus })} className="absolute inset-0 opacity-0 cursor-pointer">
                        {VISA_STATUSES.map((s) => <option key={s} value={s}>{t(`crm.visa.${s}`)}</option>)}
                      </select>
                    </span>
                  </td>
                  <td>
                    <Meter value={done} max={steps} tone={done === steps ? "emerald" : "gold"} />
                    <p className="mt-1 text-xs tabular muted">{done === steps ? <span className="font-semibold text-emerald-700">{t("crm.bookings.pilgrims.ready")}</span> : `${done} / ${steps}`}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
