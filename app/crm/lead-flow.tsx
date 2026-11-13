import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleSlash,
  Package as PackageIcon,
  PartyPopper,
  Plane,
  RotateCcw,
  Search,
  Send,
  Ticket,
  Users,
} from "lucide-react";
import { useI18n, type TFunction } from "~/i18n";
import { serviceForCategory, VOID_PAYMENT_STATUSES, type LeadStage, type Locale } from "~/lib/constants";
import { cn, dayKey, formatDate, formatDzd, leadName } from "~/lib/format";
import { formatPhone, waChatLink } from "~/lib/phone";
import { seatsFor } from "~/lib/stats";
import type { Booking, Departure, Lead, Package } from "~/lib/types";
import { WhatsAppIcon } from "~/site/components";
import { Avatar, EmptyState, Modal, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { useCrm } from "./store";

/**
 * The guided path through a sale, modelled on the "deal + next activity" idea of
 * pipeline CRMs: five plain steps on top, and one obvious button for what to do now.
 * The detailed stages still exist (reports, filters); employees no longer need them.
 */

const STEPS = ["new", "talking", "offer", "booked", "done"] as const;
type Step = (typeof STEPS)[number];

function stepOf(lead: Lead, hasBooking: boolean): Step | "lost" {
  if (lead.stage === "lost") return "lost";
  if (lead.stage === "completed") return "done";
  if (hasBooking || ["awaiting_documents", "awaiting_deposit", "confirmed", "travel_preparation"].includes(lead.stage)) return "booked";
  if (lead.stage === "package_sent" || lead.packageId) return lead.stage === "new" ? "new" : "offer";
  if (lead.stage === "new") return "new";
  return "talking";
}

export function useLeadBookings(lead: Lead): Booking[] {
  const { data } = useCrm();
  return useMemo(
    () => data.bookings.filter((b) => b.leadId === lead.id && !VOID_PAYMENT_STATUSES.includes(b.paymentStatus)),
    [data.bookings, lead.id],
  );
}

/** Five-step progress bar shown under the customer's name. */
export function JourneyBar({ lead }: { lead: Lead }) {
  const { t } = useI18n();
  const bookings = useLeadBookings(lead);
  const step = stepOf(lead, bookings.length > 0);
  if (step === "lost") {
    return (
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
        <CircleSlash className="size-3.5" />
        {t("crm.flow.lostStep")}
      </p>
    );
  }
  const current = STEPS.indexOf(step);
  return (
    <ol className="mt-3 grid grid-cols-5 gap-1" aria-label={t("crm.flow.next")}>
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0">
          <span className={cn("block h-1.5 rounded-full", i <= current ? "bg-emerald-600" : "bg-sand-300")} />
          <span className={cn("mt-1 block truncate text-[11px]", i === current ? "font-bold text-navy-900" : i < current ? "text-emerald-700" : "muted")}>
            {t(`crm.flow.steps.${s}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Text for WhatsApp with the offer name, price and its page on the website. */
function offerMessage(t: TFunction, lead: Lead, pkg: Package, locale: Locale): string {
  const name = lead.displayName || lead.waName || "";
  const price = pkg.priceDzd ? ` — ${formatDzd(pkg.priceDzd, locale)}` : "";
  const link = pkg.status === "active" ? `${window.location.origin}/${locale}/packages/${pkg.slug}` : "";
  return t("crm.flow.waOffer", { name, offer: pkg.name, price, link }).replace(/\s*\S*:\s*$/, "").trim();
}

/** The box with one clear action, at the top of the customer card. */
export function NextStep({ lead, onBook }: { lead: Lead; onBook: (packageId?: string | null, departureId?: string | null) => void }) {
  const { t, locale } = useI18n();
  const { packageById, departureById, apply } = useCrm();
  const toast = useToast();
  const bookings = useLeadBookings(lead);
  const step = stepOf(lead, bookings.length > 0);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const name = leadName(lead);
  const offer = lead.packageId ? packageById.get(lead.packageId) : undefined;
  const wa = waChatLink(lead.phone);

  const setStage = async (stage: LeadStage, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      apply("leads", await api<Lead>("leads.update", { id: lead.id, patch: { stage, ...extra } }));
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  };

  let tone = "border-emerald-200 bg-emerald-50/70";
  let icon = <ArrowRight className="size-5" />;
  let title = "";
  let body = "";
  let actions: ReactNode = null;

  switch (step) {
    case "new":
      title = t("crm.flow.reply.title", { name });
      body = t("crm.flow.reply.body");
      icon = <WhatsAppIcon className="size-5" />;
      actions = (
        <>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp">
              <WhatsAppIcon className="size-4" />
              {t("crm.flow.reply.open")}
            </a>
          )}
          <button type="button" className={cn("btn", wa ? "btn-secondary" : "btn-primary")} disabled={busy} onClick={() => setStage("contacted")}>
            {busy ? <Spinner /> : <Check className="size-4" />}
            {t("crm.flow.reply.done")}
          </button>
        </>
      );
      break;
    case "talking":
      title = t("crm.flow.choose.title", { name });
      body = t("crm.flow.choose.body");
      icon = <PackageIcon className="size-5" />;
      actions = (
        <button type="button" className="btn btn-primary" onClick={() => setPicker(true)}>
          <PackageIcon className="size-4" />
          {t("crm.flow.choose.action")}
        </button>
      );
      break;
    case "offer":
      title = t("crm.flow.offer.title", { name, offer: offer?.name ?? "—" });
      body = t("crm.flow.offer.body");
      icon = <Ticket className="size-5" />;
      actions = (
        <>
          <button type="button" className="btn btn-primary" onClick={() => onBook(lead.packageId)}>
            <Ticket className="size-4" />
            {t("crm.flow.offer.book")}
          </button>
          {wa && offer && (
            <a href={waChatLink(lead.phone, offerMessage(t, lead, offer, locale))!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              <Send className="size-4" />
              {t("crm.flow.offer.send")}
            </a>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setPicker(true)}>
            {t("crm.flow.offer.change")}
          </button>
        </>
      );
      break;
    case "booked": {
      const booking = bookings[0];
      if (!booking) {
        title = t("crm.flow.book.title", { name });
        body = t("crm.flow.book.body");
        icon = <Ticket className="size-5" />;
        actions = (
          <button type="button" className="btn btn-primary" onClick={() => onBook(lead.packageId)}>
            <Ticket className="size-4" />
            {t("crm.flow.book.action")}
          </button>
        );
        break;
      }
      const departure = departureById.get(booking.departureId);
      const travelling = lead.stage === "travel_preparation";
      title = travelling ? t("crm.flow.travel.title") : t("crm.flow.booked.title", { offer: packageById.get(booking.packageId)?.name ?? "—" });
      body = travelling
        ? t("crm.flow.travel.body")
        : t("crm.flow.booked.body", {
            date: departure ? formatDate(departure.departDate, locale) : "—",
            travelers: booking.travelers,
            paid: formatDzd(booking.paidDzd, locale),
            total: formatDzd(booking.totalDzd, locale),
          });
      icon = travelling ? <Plane className="size-5" /> : <Check className="size-5" />;
      actions = (
        <>
          <Link to="/admin/bookings" className="btn btn-secondary">
            {t("crm.flow.booked.open")}
          </Link>
          {travelling ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStage("completed")}>
              {busy ? <Spinner /> : <PartyPopper className="size-4" />}
              {t("crm.flow.travel.complete")}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStage("travel_preparation")}>
              {busy ? <Spinner /> : <Plane className="size-4" />}
              {t("crm.flow.booked.travel")}
            </button>
          )}
        </>
      );
      break;
    }
    case "done":
      tone = "border-teal-200 bg-teal-50/70";
      title = t("crm.flow.done.title");
      body = t("crm.flow.done.body");
      icon = <PartyPopper className="size-5" />;
      break;
    case "lost":
      tone = "border-rose-200 bg-rose-50/70";
      title = t("crm.flow.lost.title");
      body = t("crm.flow.lost.body", { reason: lead.lostReason ?? "—" });
      icon = <CircleSlash className="size-5" />;
      actions = (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStage("contacted", { lostReason: null })}>
          {busy ? <Spinner /> : <RotateCcw className="size-4" />}
          {t("crm.flow.lost.reopen")}
        </button>
      );
      break;
  }

  const canLose = step === "new" || step === "talking" || step === "offer";

  return (
    <section className={cn("rounded-2xl border p-4", tone)}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">{t("crm.flow.next")}</p>
      <div className="mt-2 flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-emerald-700 shadow-sm">{icon}</span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold leading-snug" dir="auto">{title}</h3>
          <p className="mt-0.5 text-[13px] text-navy-600 leading-relaxed">{body}</p>
        </div>
      </div>
      {(actions || canLose) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {actions}
          {canLose && (
            <button type="button" className="ms-auto text-[13px] font-medium text-rose-700 hover:underline" onClick={() => setLostOpen(true)}>
              {t("crm.flow.notInterested")}
            </button>
          )}
        </div>
      )}
      <OfferPicker lead={lead} open={picker} onClose={() => setPicker(false)} onBook={(p, d) => { setPicker(false); onBook(p, d); }} />
      <LostModal lead={lead} open={lostOpen} onClose={() => setLostOpen(false)} />
    </section>
  );
}

// ── Not interested ──────────────────────────────────────────────────────────
const LOST_REASONS = ["price", "other_agency", "dates", "no_answer", "later"] as const;

export function LostModal({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { apply } = useCrm();
  const toast = useToast();
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (reason: string) => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      apply("leads", await api<Lead>("leads.update", { id: lead.id, patch: { stage: "lost", lostReason: reason.trim() } }));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t("crm.flow.lostTitle", { name: leadName(lead) })}>
      <div className="grid gap-2">
        {LOST_REASONS.map((r) => (
          <button key={r} type="button" disabled={busy} className="btn btn-secondary justify-start h-11" onClick={() => save(t(`crm.flow.lostReasons.${r}`))}>
            {t(`crm.flow.lostReasons.${r}`)}
          </button>
        ))}
        <form
          className="mt-1 flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save(other);
          }}
        >
          <input className="input h-11" value={other} maxLength={300} placeholder={t("crm.flow.lostOther")} onChange={(e) => setOther(e.target.value)} />
          <button type="submit" className="btn btn-danger h-11" disabled={busy || !other.trim()}>
            {t("crm.flow.lostConfirm")}
          </button>
        </form>
      </div>
    </Modal>
  );
}

// ── Offer picker ────────────────────────────────────────────────────────────
function useOpenDepartures() {
  const { data } = useCrm();
  const today = dayKey(new Date());
  return useMemo(() => {
    const byPackage = new Map<string, Array<{ d: Departure; left: number }>>();
    for (const d of data.departures) {
      if (d.status !== "open" || d.departDate < today) continue;
      const list = byPackage.get(d.packageId) ?? [];
      list.push({ d, left: seatsFor(d, data.seatsTaken).left });
      byPackage.set(d.packageId, list);
    }
    for (const list of byPackage.values()) list.sort((a, b) => a.d.departDate.localeCompare(b.d.departDate));
    return byPackage;
  }, [data.departures, data.seatsTaken, today]);
}

export function OfferPicker({ lead, open, onClose, onBook }: {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onBook: (packageId: string, departureId: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const { data, apply } = useCrm();
  const toast = useToast();
  const departures = useOpenDepartures();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(lead.packageId);
  const [departureId, setDepartureId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const offers = data.packages
    .filter((p) => p.status === "active" || p.status === "sold_out" || p.status === "draft" || p.id === lead.packageId)
    .filter((p) => p.status !== "archived" || p.id === lead.packageId)
    .filter((p) => !query.trim() || `${p.name} ${p.nameAr ?? ""} ${p.refCode}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));
  const chosen = selected ? data.packages.find((p) => p.id === selected) : undefined;

  const choose = async (send: boolean) => {
    if (!chosen) return;
    setBusy(true);
    try {
      const stage: LeadStage = ["new", "contacted", "qualified"].includes(lead.stage) ? "package_sent" : lead.stage;
      const updated = await api<Lead>("leads.update", {
        id: lead.id,
        patch: { packageId: chosen.id, stage, ...(lead.serviceType === "unknown" && serviceForCategory(chosen.category) !== "unknown" ? { serviceType: serviceForCategory(chosen.category) } : {}) },
      });
      apply("leads", updated);
      if (send) {
        const link = waChatLink(lead.phone, offerMessage(t, updated, chosen, locale));
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t("crm.flow.picker.title")} subtitle={t("crm.flow.picker.subtitle", { name: leadName(lead) })}>
      {data.packages.length === 0 ? (
        <EmptyState icon={PackageIcon} title={t("crm.flow.picker.empty")} action={<Link to="/admin/packages" className="btn btn-primary">{t("crm.nav.packages")}</Link>} />
      ) : (
        <div className="grid gap-4">
          <label className="relative block">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 muted" />
            <input className="input ps-9 h-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("crm.flow.picker.search")} />
          </label>

          <ul className="grid gap-3 sm:grid-cols-2 max-h-[46vh] overflow-y-auto scroll-thin pe-1">
            {offers.map((p) => {
              const dates = departures.get(p.id) ?? [];
              const isSel = p.id === selected;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(p.id);
                      setDepartureId(dates.find((x) => x.left > 0)?.d.id ?? null);
                    }}
                    className={cn(
                      "w-full overflow-hidden rounded-xl border-2 text-start transition-colors",
                      isSel ? "border-emerald-600 ring-4 ring-emerald-100" : "border-[var(--line)] hover:border-emerald-300",
                    )}
                  >
                    <div className="relative h-24 bg-gradient-to-br from-navy-900 via-navy-800 to-emerald-800">
                      {p.coverImage ? <img src={p.coverImage} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 pattern-star" aria-hidden="true" />}
                      {isSel && (
                        <span className="absolute top-2 end-2 grid size-7 place-items-center rounded-full bg-emerald-600 text-white">
                          <Check className="size-4" />
                        </span>
                      )}
                      {p.id === lead.packageId && (
                        <span className="absolute bottom-2 start-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-navy-900">{t("crm.flow.picker.current")}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold leading-snug">{p.name}</p>
                      <p className="mt-1 text-[13px] muted">
                        {p.priceDzd ? `${t("crm.flow.picker.from")} ${formatDzd(p.priceDzd, locale)}` : "—"}
                        {p.durationDays ? ` · ${t("site.packages.days", { n: p.durationDays })}` : ""}
                      </p>
                      <p className="mt-1 text-[12px] font-medium text-emerald-700">
                        {dates.length ? `${formatDate(dates[0].d.departDate, locale)} · ${dates[0].left > 0 ? t("crm.flow.picker.seats", { n: dates[0].left }) : t("crm.flow.picker.full")}` : <span className="muted">{t("crm.flow.picker.noDates")}</span>}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {chosen && (departures.get(chosen.id)?.length ?? 0) > 0 && (
            <div>
              <p className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
                <CalendarDays className="size-4 text-emerald-700" />
                {t("crm.flow.picker.dates")}
              </p>
              <div className="flex flex-wrap gap-2">
                {departures.get(chosen.id)!.map(({ d, left }) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={left === 0}
                    onClick={() => setDepartureId(d.id)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2 text-start text-[13px] disabled:opacity-40",
                      departureId === d.id ? "border-emerald-600 bg-emerald-50" : "border-[var(--line)] hover:border-emerald-300",
                    )}
                  >
                    <span className="block font-semibold">{formatDate(d.departDate, locale)}</span>
                    <span className="block text-[11px] muted">{left > 0 ? t("crm.flow.picker.seats", { n: left }) : t("crm.flow.picker.full")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
            <button type="button" className="btn btn-secondary" disabled={!chosen || busy} onClick={() => choose(false)}>
              {busy ? <Spinner /> : <Check className="size-4" />}
              {t("crm.flow.picker.choose")}
            </button>
            {lead.phone && (
              <button type="button" className="btn btn-whatsapp" disabled={!chosen || busy} onClick={() => choose(true)}>
                <WhatsAppIcon className="size-4" />
                {t("crm.flow.picker.send")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!chosen || busy || !(departures.get(chosen?.id ?? "")?.some((x) => x.left > 0))}
              onClick={() => chosen && onBook(chosen.id, departureId)}
            >
              <Ticket className="size-4" />
              {t("crm.flow.picker.book")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Customer picker (from an offer) ─────────────────────────────────────────
export function CustomerPicker({ pkg, open, onClose, onPick }: { pkg: Package; open: boolean; onClose: () => void; onPick: (lead: Lead) => void }) {
  const { t } = useI18n();
  const { data } = useCrm();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase().replace(/\s/g, "");
  const leads = data.leads
    .filter((l) => l.stage !== "lost")
    .filter((l) => !q || `${leadName(l)}${l.phone ?? ""}`.toLowerCase().replace(/\s/g, "").includes(q))
    .sort((a, b) => Number(b.packageId === pkg.id) - Number(a.packageId === pkg.id) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
    .slice(0, 30);
  return (
    <Modal open={open} onClose={onClose} title={t("crm.flow.customerPicker.title")} subtitle={t("crm.flow.customerPicker.subtitle", { offer: pkg.name })}>
      <label className="relative block">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 muted" />
        <input className="input ps-9 h-11" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} placeholder={t("crm.flow.customerPicker.search")} />
      </label>
      {leads.length === 0 ? (
        <p className="mt-6 text-sm muted text-center">{t("crm.flow.customerPicker.empty")}</p>
      ) : (
        <ul className="mt-3 grid gap-1 max-h-[50vh] overflow-y-auto scroll-thin">
          {leads.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => onPick(l)} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-sand-100">
                <Avatar name={leadName(l)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" dir="auto">{leadName(l)}</span>
                  <span className="block text-xs muted ltr-inline">{l.phone ? formatPhone(l.phone) : "—"}</span>
                </span>
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <Users className="size-3.5" />
                  {t("crm.flow.customerPicker.choose")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
