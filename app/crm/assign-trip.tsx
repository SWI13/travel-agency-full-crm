import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, Check, CircleSlash, Minus, Plane, PlaneTakeoff, Plus, RotateCcw, Ticket, Users } from "lucide-react";
import { useI18n } from "~/i18n";
import { VOID_PAYMENT_STATUSES } from "~/lib/constants";
import { cn, dayKey, formatDate, formatDzd, leadName } from "~/lib/format";
import { formatPhone } from "~/lib/phone";
import { seatsFor } from "~/lib/stats";
import type { Booking, Departure, Lead } from "~/lib/types";
import { Badge, EmptyState, Modal, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { canMarkDeparted, MarkDepartedModal } from "./departure-actions";
import { LostModal } from "./lead-flow";
import { useCrm } from "./store";

/**
 * The whole sales path in four plain states, derived from the records themselves:
 *   to assign → assigned to a trip (no seat yet) → booked (seats taken) → departed.
 * Nobody moves a customer through stages by hand any more.
 */
export type TripStatus = "none" | "assigned" | "booked" | "departed" | "lost";
export const TRIP_TONE: Record<TripStatus, string> = { none: "amber", assigned: "blue", booked: "emerald", departed: "teal", lost: "rose" };

export interface LeadTrip {
  status: TripStatus;
  booking: Booking | null;
  departureId: string | null;
}

export function tripOf(lead: Lead, bookings: Booking[]): LeadTrip {
  const active = bookings.filter((b) => b.leadId === lead.id && !VOID_PAYMENT_STATUSES.includes(b.paymentStatus));
  const waiting = active.find((b) => !b.departedAt);
  if (waiting) return { status: "booked", booking: waiting, departureId: waiting.departureId };
  if (lead.departureId && !active.some((b) => b.departureId === lead.departureId)) return { status: lead.stage === "lost" ? "lost" : "assigned", booking: null, departureId: lead.departureId };
  const departed = active.find((b) => b.departedAt);
  if (departed) return { status: "departed", booking: departed, departureId: departed.departureId };
  if (lead.stage === "lost") return { status: "lost", booking: null, departureId: null };
  return { status: "none", booking: null, departureId: null };
}

export function useLeadTrip(lead: Lead): LeadTrip {
  const { data } = useCrm();
  return useMemo(() => tripOf(lead, data.bookings), [lead, data.bookings]);
}

export function TripBadge({ status }: { status: TripStatus }) {
  const { t } = useI18n();
  return <Badge tone={TRIP_TONE[status]} dot>{t(`crm.trip.status.${status}`)}</Badge>;
}

/** Departures that can still be sold, grouped by trip. */
function useOpenTrips() {
  const { data, packageById } = useCrm();
  const today = dayKey(new Date());
  return useMemo(() => {
    const groups = new Map<string, Array<{ d: Departure; left: number }>>();
    for (const d of data.departures) {
      if (d.status !== "open" || d.departDate < today) continue;
      const pkg = packageById.get(d.packageId);
      if (!pkg || pkg.status === "archived") continue;
      const list = groups.get(d.packageId) ?? [];
      list.push({ d, left: seatsFor(d, data.seatsTaken).left });
      groups.set(d.packageId, list);
    }
    for (const list of groups.values()) list.sort((a, b) => a.d.departDate.localeCompare(b.d.departDate));
    return [...groups.entries()]
      .map(([packageId, dates]) => ({ pkg: packageById.get(packageId)!, dates }))
      .sort((a, b) => a.dates[0].d.departDate.localeCompare(b.dates[0].d.departDate));
  }, [data.departures, data.seatsTaken, packageById, today]);
}

/** One window: trip, date, travellers, confirm. */
export function AssignTripModal({ lead, onClose, initial }: {
  lead: Lead;
  onClose: () => void;
  initial?: { packageId?: string | null; departureId?: string | null; travelers?: number | null; confirmed?: boolean };
}) {
  const { t, locale } = useI18n();
  const { apply, departureById } = useCrm();
  const toast = useToast();
  const trips = useOpenTrips();
  const startDeparture = initial?.departureId ? departureById.get(initial.departureId) : undefined;
  const [packageId, setPackageId] = useState<string | null>(
    startDeparture?.packageId ?? initial?.packageId ?? lead.packageId ?? (trips.length === 1 ? trips[0].pkg.id : null),
  );
  const trip = trips.find((x) => x.pkg.id === packageId);
  const [departureId, setDepartureId] = useState<string | null>(initial?.departureId ?? null);
  const selected = trip?.dates.find((x) => x.d.id === departureId) ?? null;
  const [travelers, setTravelers] = useState<number>(
    Math.max(1, initial?.travelers ?? lead.tripTravelers ?? ((lead.adults ?? 0) + (lead.children ?? 0) || 1)),
  );
  const [confirmed, setConfirmed] = useState(!!initial?.confirmed);
  const [busy, setBusy] = useState(false);

  const unit = selected ? selected.d.priceDzd ?? trip?.pkg.priceDzd ?? null : null;
  const notEnough = confirmed && !!selected && travelers > selected.left;

  const pickTrip = (id: string) => {
    setPackageId(id);
    const dates = trips.find((x) => x.pkg.id === id)?.dates ?? [];
    setDepartureId(dates.length === 1 ? dates[0].d.id : null);
  };

  async function submit() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ lead: Lead; booking: Booking | null }>("leads.assignTrip", {
        leadId: lead.id,
        departureId: selected.d.id,
        travelers,
        confirmed,
      });
      apply("leads", result.lead);
      if (result.booking) apply("bookings", result.booking);
      toast.success(confirmed ? t("crm.trip.doneBooked") : t("crm.trip.doneAssigned"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("crm.trip.title")}
      subtitle={`${leadName(lead)}${lead.phone ? ` · ${formatPhone(lead.phone)}` : ""}`}
      footer={
        trips.length > 0 && (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
            <button type="button" className="btn btn-primary" disabled={!selected || busy || notEnough} onClick={submit}>
              {busy ? <Spinner /> : <Check className="size-4" />}
              {t("crm.trip.confirm")}
            </button>
          </>
        )
      }
    >
      {trips.length === 0 ? (
        <EmptyState icon={PlaneTakeoff} title={t("crm.trip.noTrips")} hint={t("crm.trip.noTripsHint")} action={<Link to="/admin/departures" className="btn btn-primary" onClick={onClose}>{t("crm.nav.trips")}</Link>} />
      ) : (
        <div className="grid gap-5">
          <section>
            <p className="field-label">1 · {t("crm.trip.chooseTrip")}</p>
            <ul className="grid gap-2 sm:grid-cols-2 max-h-[30vh] overflow-y-auto scroll-thin pe-1">
              {trips.map(({ pkg, dates }) => {
                const on = pkg.id === packageId;
                const best = dates.reduce((sum, x) => sum + x.left, 0);
                return (
                  <li key={pkg.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickTrip(pkg.id)}
                      className={cn("w-full rounded-xl border-2 p-3 text-start transition-colors", on ? "border-emerald-600 bg-emerald-50" : "border-[var(--line)] hover:border-emerald-300")}
                    >
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-semibold leading-snug" dir="auto">{pkg.name}</span>
                        {on && <Check className="size-4 shrink-0 text-emerald-700" />}
                      </span>
                      <span className="mt-1 block text-[13px] muted">
                        {pkg.priceDzd ? formatDzd(pkg.priceDzd, locale) : "—"} · {t("crm.trip.dates", { n: dates.length })} · {t("crm.trip.seatsLeft", { n: best })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {trip && (
            <section>
              <p className="field-label flex items-center gap-1.5"><CalendarDays className="size-4 text-emerald-700" />2 · {t("crm.trip.chooseDate")}</p>
              <div className="flex flex-wrap gap-2">
                {trip.dates.map(({ d, left }) => {
                  const on = d.id === departureId;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDepartureId(d.id)}
                      className={cn("rounded-xl border-2 px-3 py-2 text-start text-[13px] min-w-36", on ? "border-emerald-600 bg-emerald-50" : "border-[var(--line)] hover:border-emerald-300")}
                    >
                      <span className="block font-semibold">{formatDate(d.departDate, locale)}</span>
                      <span className="block text-[12px] tabular">{formatDzd(d.priceDzd ?? trip.pkg.priceDzd, locale)}</span>
                      <span className={cn("block text-[11px] font-medium", left === 0 ? "text-rose-700" : "text-emerald-700")}>
                        {left === 0 ? t("crm.trip.full") : t("crm.trip.seatsLeft", { n: left })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {selected && (
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="field-label flex items-center gap-1.5"><Users className="size-4 text-emerald-700" />3 · {t("crm.trip.travelers")}</p>
                <div className="flex items-center gap-2">
                  <button type="button" className="icon-btn border border-[var(--line)]" aria-label="−" disabled={travelers <= 1} onClick={() => setTravelers((n) => Math.max(1, n - 1))}><Minus className="size-4" /></button>
                  <input type="number" min={1} max={100} dir="ltr" className="input w-20 text-center tabular" aria-label={t("crm.trip.travelers")} value={travelers} onChange={(e) => setTravelers(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
                  <button type="button" className="icon-btn border border-[var(--line)]" aria-label="+" onClick={() => setTravelers((n) => Math.min(100, n + 1))}><Plus className="size-4" /></button>
                </div>
              </div>
              <div className="rounded-xl bg-sand-100 px-4 py-3">
                <p className="text-[13px] muted">{t("crm.trip.total")}</p>
                <p className="font-display text-xl font-semibold tabular">{unit == null ? "—" : formatDzd(unit * travelers, locale)}</p>
              </div>

              <label className={cn("sm:col-span-2 flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer", confirmed ? "border-emerald-600 bg-emerald-50" : "border-[var(--line)]")}>
                <input type="checkbox" className="mt-1 size-4 accent-emerald-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>
                  <span className="block font-semibold">{t("crm.trip.confirmedLabel")}</span>
                  <span className="block text-[13px] muted">{confirmed ? t("crm.trip.confirmedOn") : t("crm.trip.confirmedOff")}</span>
                </span>
              </label>
              {notEnough && <p className="sm:col-span-2 text-sm font-medium text-rose-700">{t("crm.trip.notEnough", { n: selected.left })}</p>}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The customer's trip, at the top of the customer card, with the one action that matters now. */
export function TripPanel({ lead }: { lead: Lead }) {
  const { t, locale } = useI18n();
  const { packageById, departureById, data, apply } = useCrm();
  const toast = useToast();
  const trip = useLeadTrip(lead);
  const [assign, setAssign] = useState<null | { confirmed: boolean }>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [departing, setDeparting] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const departure = trip.departureId ? departureById.get(trip.departureId) : undefined;
  const pkg = departure ? packageById.get(departure.packageId) : undefined;
  const seats = departure ? seatsFor(departure, data.seatsTaken) : null;
  const travelers = trip.booking?.travelers ?? lead.tripTravelers ?? 1;

  const call = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  };
  const clear = () => call(async () => apply("leads", await api<Lead>("leads.clearTrip", { leadId: lead.id })));
  const reopen = () => call(async () => apply("leads", await api<Lead>("leads.update", { id: lead.id, patch: { stage: "contacted", lostReason: null } })));

  return (
    <section className={cn("rounded-2xl border p-4", trip.status === "none" ? "border-amber-200 bg-amber-50/60" : trip.status === "lost" ? "border-rose-200 bg-rose-50/60" : "border-emerald-200 bg-emerald-50/60")}>
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">{t("crm.trip.panel")}</p>
        <span className="ms-auto"><TripBadge status={trip.status} /></span>
      </div>

      {trip.status === "lost" ? (
        <>
          <p className="mt-2 text-sm">{t("crm.trip.lostBody", { reason: lead.lostReason ?? "—" })}</p>
          <div className="mt-3">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={reopen}>
              {busy ? <Spinner /> : <RotateCcw className="size-4" />}
              {t("crm.trip.reopen")}
            </button>
          </div>
        </>
      ) : trip.status === "none" ? (
        <>
          <p className="mt-2 text-sm text-navy-700">{t("crm.trip.noneBody")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setAssign({ confirmed: false })}>
              <Ticket className="size-4" />
              {t("crm.trip.assign")}
            </button>
            <button type="button" className="ms-auto inline-flex items-center gap-1 text-[13px] font-medium text-rose-700 hover:underline" onClick={() => setLostOpen(true)}>
              <CircleSlash className="size-3.5" />
              {t("crm.flow.notInterested")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-emerald-700 shadow-sm"><Plane className="size-5" /></span>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold leading-snug" dir="auto">{pkg?.name ?? "—"}</h3>
              <p className="text-[13px] text-navy-600">
                {formatDate(departure?.departDate, locale)} · {t("crm.trip.travelersN", { n: travelers })}
                {trip.booking ? ` · ${formatDzd(trip.booking.paidDzd, locale)} / ${formatDzd(trip.booking.totalDzd, locale)}` : seats ? ` · ${t("crm.trip.seatsLeft", { n: seats.left })}` : ""}
              </p>
              <p className="mt-1 text-[12px] muted">{t(`crm.trip.hint.${trip.status}`)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {trip.status === "assigned" && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => setAssign({ confirmed: true })}>
                  <Check className="size-4" />
                  {t("crm.trip.confirmBooking")}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAssign({ confirmed: false })}>{t("crm.trip.change")}</button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={clear}>{t("crm.trip.remove")}</button>
              </>
            )}
            {trip.status === "booked" && trip.booking && (
              <>
                {canMarkDeparted(trip.booking) && (
                  <button type="button" className="btn btn-primary" onClick={() => setDeparting(trip.booking)}>
                    <Plane className="size-4" />
                    {t("crm.bookings.travel.action")}
                  </button>
                )}
                <Link to="/admin/bookings" className="btn btn-secondary">{t("crm.trip.payments")}</Link>
              </>
            )}
            {trip.status === "departed" && (
              <>
                <Link to="/admin/departed" className="btn btn-secondary">{t("crm.bookings.travel.seeList")}</Link>
                <button type="button" className="btn btn-ghost" onClick={() => setAssign({ confirmed: false })}>{t("crm.trip.newTrip")}</button>
              </>
            )}
          </div>
        </>
      )}

      {assign && (
        <AssignTripModal
          lead={lead}
          onClose={() => setAssign(null)}
          initial={trip.status === "assigned" ? { departureId: trip.departureId, travelers: lead.tripTravelers, confirmed: assign.confirmed } : { confirmed: assign.confirmed }}
        />
      )}
      <LostModal lead={lead} open={lostOpen} onClose={() => setLostOpen(false)} />
      {departing && <MarkDepartedModal booking={departing} onClose={() => setDeparting(null)} />}
    </section>
  );
}
