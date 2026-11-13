import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  CheckCheck,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  Ticket,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useI18n } from "~/i18n";
import {
  FOLLOWUP_REASONS,
  LEAD_STAGES,
  PRIORITIES,
  ROOM_TYPES,
  SERVICE_TYPES,
  WON_STAGES,
} from "~/lib/constants";
import { cn, dayKey, formatDate, formatDateTime, formatDzd, formatTime, leadName, toLocalInput } from "~/lib/format";
import { formatPhone, waChatLink } from "~/lib/phone";
import type { Booking, FollowUp, Lead, Message } from "~/lib/types";
import { Avatar, Badge, DemoBadge, Drawer, EmptyState, Field, Modal, Segmented, SkeletonRows, Spinner } from "~/ui";
import { useConfirm, useToast } from "~/ui/feedback";
import { WhatsAppIcon } from "~/site/components";
import { api, errorMessage, PAYMENT_TONE, SOURCE_TONE, STAGE_TONE } from "./api";
import { useCrm } from "./store";

type Tab = "details" | "conversation" | "tasks";

const EDITABLE = [
  "displayName", "serviceType", "stage", "priority", "assignedTo", "packageId", "departureCity",
  "departureDate", "returnDate", "adults", "children", "roomPreference", "budgetDzd", "notes", "tags", "lostReason",
] as const;
type FormState = Pick<Lead, (typeof EDITABLE)[number]>;

const pickForm = (lead: Lead): FormState =>
  Object.fromEntries(EDITABLE.map((key) => [key, lead[key]])) as unknown as FormState;

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

const numberOrNull = (value: string) => (value.trim() === "" ? null : Math.max(0, Math.round(Number(value))));

export function LeadDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const { leadById } = useCrm();
  const lead = leadId ? leadById.get(leadId) : undefined;
  return (
    <Drawer open={!!leadId} onClose={onClose} label={lead ? leadName(lead) : t("crm.lead.customer")}>
      {lead ? (
        <LeadPanel key={lead.id} lead={lead} onClose={onClose} />
      ) : (
        <div className="flex-1 grid place-items-center p-8">
          <EmptyState icon={MessageCircle} title={t("crm.lead.notFound")} action={<button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.close")}</button>} />
        </div>
      )}
    </Drawer>
  );
}

function LeadPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { data, can, staffById, packageById, apply, drop, run } = useCrm();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>(lead.unreadCount > 0 ? "conversation" : "details");
  const [form, setForm] = useState<FormState>(() => pickForm(lead));
  const [saving, setSaving] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  const dirty = useMemo(
    () => EDITABLE.some((key) => JSON.stringify(form[key] ?? null) !== JSON.stringify(lead[key] ?? null)),
    [form, lead],
  );
  // Keep the form in step with live updates as long as the employee has not started editing.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setForm(pickForm(lead));
  }, [lead]);

  // Opening the conversation marks it as read.
  useEffect(() => {
    if (lead.unreadCount > 0 && tab === "conversation") {
      void api<Lead>("leads.markRead", { id: lead.id }).then((updated) => apply("leads", updated)).catch(() => {});
    }
  }, [lead.id, lead.unreadCount, tab, apply]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (JSON.stringify(form[key] ?? null) !== JSON.stringify(lead[key] ?? null)) patch[key] = form[key];
    }
    if (form.stage === "lost" && !form.lostReason?.trim()) {
      toast.error(t("crm.leads.lost.title"));
      return;
    }
    setSaving(true);
    try {
      const updated = await api<Lead>("leads.update", { id: lead.id, patch });
      apply("leads", updated);
      setForm(pickForm(updated));
      toast.success(t("crm.common.saved"));
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm({ title: t("crm.lead.delete"), body: t("crm.lead.deleteConfirm"), danger: true, confirmLabel: t("crm.common.delete") }))) return;
    if ((await run("leads.delete", { id: lead.id })) !== undefined) {
      drop("leads", lead.id);
      onClose();
    }
  }

  const waLink = waChatLink(lead.phone);
  const followUps = data.followups.filter((f) => f.leadId === lead.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const bookings = data.bookings.filter((b) => b.leadId === lead.id);
  const pending = followUps.filter((f) => f.status === "pending").length;
  const agents = data.staff.filter((s) => s.isActive || s.id === lead.assignedTo);
  const packages = data.packages.filter((p) => p.status !== "archived" || p.id === lead.packageId);

  return (
    <>
      <header className="bg-white border-b border-[var(--line)] px-5 pt-4 pb-0">
        <div className="flex items-start gap-3">
          <Avatar name={leadName(lead)} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl font-semibold truncate" dir="auto">{leadName(lead)}</h2>
              <DemoBadge show={lead.isDemo} />
            </div>
            <p className="text-sm muted">
              {lead.phone ? <span className="ltr-inline">{formatPhone(lead.phone)}</span> : t("crm.lead.noPhone")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={STAGE_TONE[lead.stage]} dot>{t(`crm.stage.${lead.stage}`)}</Badge>
              <Badge tone={SOURCE_TONE[lead.source]}>{t(`crm.source.${lead.source}`)}</Badge>
              {lead.serviceType !== "unknown" && <Badge tone="gold">{t(`crm.service.${lead.serviceType}`)}</Badge>}
            </div>
          </div>
          <button type="button" className="icon-btn -me-2 -mt-1" onClick={onClose} aria-label={t("crm.common.close")}>
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp btn-sm">
              <WhatsAppIcon className="size-4" />
              {t("crm.lead.openWhatsApp")}
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="btn btn-secondary btn-sm">
              <Phone className="size-3.5" />
              {t("crm.lead.call")}
            </a>
          )}
        </div>
        <div className="mt-4 -mb-px flex gap-5 overflow-x-auto">
          {(
            [
              ["details", t("crm.lead.customer"), 0],
              ["conversation", t("crm.lead.conversation"), lead.unreadCount],
              ["tasks", `${t("crm.lead.followups")} · ${t("crm.lead.bookings")}`, pending],
            ] as Array<[Tab, string, number]>
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5",
                tab === key ? "border-emerald-600 text-navy-900" : "border-transparent muted hover:text-navy-900",
              )}
            >
              {label}
              {count > 0 && <span className="tabular text-[11px] px-1.5 rounded-full bg-emerald-500 text-white">{count}</span>}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        {tab === "conversation" && <Conversation lead={lead} />}

        {tab === "details" && (
          <div className="p-5 grid gap-4">
            <Section title={t("crm.lead.customer")}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Fact label={t("crm.lead.profileName")}>{lead.waName ?? <span className="muted font-normal">{t("crm.lead.noProfileName")}</span>}</Fact>
                <Fact label={t("crm.lead.phone")}>
                  {lead.phone ? <span className="ltr-inline">{formatPhone(lead.phone)}</span> : <span className="muted font-normal">{t("crm.lead.noPhone")}</span>}
                </Fact>
                {lead.waUsername && <Fact label={t("crm.lead.username")}><span className="ltr-inline">@{lead.waUsername}</span></Fact>}
                <Fact label={t("crm.lead.created")}>{formatDateTime(lead.createdAt, locale)}</Fact>
                <Fact label={t("crm.lead.source")}>
                  <Badge tone={SOURCE_TONE[lead.source]} title={["organic", "unknown", "meta_ad"].includes(lead.source) ? t(`crm.sourceHint.${lead.source}`) : undefined}>
                    {t(`crm.source.${lead.source}`)}
                  </Badge>
                </Fact>
                {lead.refCode && <Fact label={t("crm.lead.refCode")}><span className="ltr-inline font-mono">{lead.refCode}</span></Fact>}
                {(lead.utmSource || lead.utmCampaign) && <Fact label={t("crm.lead.campaign")}>{[lead.utmSource, lead.utmCampaign].filter(Boolean).join(" · ")}</Fact>}
              </dl>
              {(lead.adTitle || lead.adId) && (
                <div className="mt-4 flex gap-3 rounded-xl bg-sand-100 border border-[var(--line)] p-3">
                  <Megaphone className="size-4 mt-0.5 text-gold-500 shrink-0" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{lead.adTitle ?? t("crm.lead.ad")}</p>
                    {lead.adBody && <p className="muted line-clamp-2">{lead.adBody}</p>}
                    {lead.adId && <p className="text-xs muted mt-1">{t("crm.lead.adId")} <span className="ltr-inline font-mono">{lead.adId}</span></p>}
                  </div>
                </div>
              )}
              <Field label={t("crm.lead.displayName")} className="mt-4">
                <input className="input" value={form.displayName ?? ""} placeholder={t("crm.lead.displayNamePh")} onChange={(e) => set("displayName", e.target.value || null)} maxLength={160} />
              </Field>
            </Section>

            <Section title={t("crm.lead.travel")}>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("crm.lead.service")}>
                  <select className="input" value={form.serviceType} onChange={(e) => set("serviceType", e.target.value as Lead["serviceType"])}>
                    {SERVICE_TYPES.map((s) => <option key={s} value={s}>{t(`crm.service.${s}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("crm.lead.package")}>
                  <select className="input" value={form.packageId ?? ""} onChange={(e) => set("packageId", e.target.value || null)}>
                    <option value="">{t("crm.lead.noPackage")}</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label={t("crm.lead.departureCity")}>
                  <input className="input" value={form.departureCity ?? ""} onChange={(e) => set("departureCity", e.target.value || null)} maxLength={80} />
                </Field>
                <Field label={t("crm.lead.room")}>
                  <select className="input" value={form.roomPreference ?? ""} onChange={(e) => set("roomPreference", e.target.value || null)}>
                    <option value="">{t("crm.lead.noPreference")}</option>
                    {ROOM_TYPES.map((r) => <option key={r} value={r}>{t(`crm.room.${r}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("crm.lead.departureDate")}>
                  <input type="date" className="input" value={form.departureDate ?? ""} onChange={(e) => set("departureDate", e.target.value || null)} />
                </Field>
                <Field label={t("crm.lead.returnDate")}>
                  <input type="date" className="input" value={form.returnDate ?? ""} min={form.departureDate ?? undefined} onChange={(e) => set("returnDate", e.target.value || null)} />
                </Field>
                <Field label={t("crm.lead.adults")}>
                  <input type="number" min={0} max={500} className="input" value={form.adults ?? ""} onChange={(e) => set("adults", numberOrNull(e.target.value))} />
                </Field>
                <Field label={t("crm.lead.children")}>
                  <input type="number" min={0} max={500} className="input" value={form.children ?? ""} onChange={(e) => set("children", numberOrNull(e.target.value))} />
                </Field>
                <Field label={t("crm.lead.budget")} className="col-span-2" hint={form.budgetDzd != null ? formatDzd(form.budgetDzd, locale) : undefined}>
                  <input type="number" min={0} step={1000} className="input" dir="ltr" value={form.budgetDzd ?? ""} onChange={(e) => set("budgetDzd", numberOrNull(e.target.value))} />
                </Field>
              </div>
            </Section>

            <Section title={t("crm.lead.sales")}>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("crm.lead.stage")}>
                  <select className="input" value={form.stage} onChange={(e) => set("stage", e.target.value as Lead["stage"])}>
                    {LEAD_STAGES.map((s) => <option key={s} value={s}>{t(`crm.stage.${s}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("crm.lead.priority")}>
                  <select className="input" value={form.priority} onChange={(e) => set("priority", e.target.value as Lead["priority"])}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{t(`crm.priority.${p}`)}</option>)}
                  </select>
                </Field>
                {form.stage === "lost" && (
                  <Field label={t("crm.lead.lostReason")} className="col-span-2">
                    <input className="input" value={form.lostReason ?? ""} placeholder={t("crm.leads.lost.placeholder")} onChange={(e) => set("lostReason", e.target.value || null)} maxLength={300} />
                  </Field>
                )}
                <Field label={t("crm.lead.agent")} className="col-span-2" hint={can("leads.assign") ? undefined : t("crm.lead.onlyManagers")}>
                  <select className="input" value={form.assignedTo ?? ""} disabled={!can("leads.assign")} onChange={(e) => set("assignedTo", e.target.value || null)}>
                    <option value="">{t("crm.common.unassigned")}</option>
                    {agents.map((s) => <option key={s.id} value={s.id}>{s.name} — {t(`crm.role.${s.role}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("crm.lead.tags")} className="col-span-2">
                  <TagInput value={form.tags} onChange={(tags) => set("tags", tags)} placeholder={t("crm.lead.tagsPh")} />
                </Field>
                <Field label={t("crm.lead.notes")} className="col-span-2">
                  <textarea className="input" rows={4} value={form.notes ?? ""} placeholder={t("crm.lead.notesPh")} onChange={(e) => set("notes", e.target.value || null)} maxLength={5000} />
                </Field>
              </div>
            </Section>

            {can("leads.delete") && (
              <button type="button" onClick={remove} className="justify-self-start inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-700 hover:underline">
                <Trash2 className="size-3.5" />
                {t("crm.lead.delete")}
              </button>
            )}
          </div>
        )}

        {tab === "tasks" && (
          <div className="p-5 grid gap-4">
            <Section title={t("crm.lead.followups")}>
              <FollowUpList followUps={followUps} />
              <FollowUpForm lead={lead} />
            </Section>
            <Section
              title={t("crm.lead.bookings")}
              aside={
                <button type="button" className="btn btn-primary btn-sm" disabled={!WON_STAGES.includes(lead.stage)} onClick={() => setBookingOpen(true)}>
                  <Ticket className="size-3.5" />
                  {t("crm.lead.convert")}
                </button>
              }
            >
              {!WON_STAGES.includes(lead.stage) && <p className="text-[13px] muted mb-3">{t("crm.lead.convertHint")}</p>}
              {bookings.length === 0 ? (
                <p className="text-sm muted">{t("crm.lead.noBookings")}</p>
              ) : (
                <ul className="grid gap-2">
                  {bookings.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{packageById.get(b.packageId)?.name ?? "—"}</p>
                        <p className="text-xs muted tabular">{formatDate(b.bookingDate, locale)} · {formatDzd(b.paidDzd, locale)} / {formatDzd(b.totalDzd, locale)}</p>
                      </div>
                      <Badge tone={PAYMENT_TONE[b.paymentStatus]} dot>{t(`crm.payment.${b.paymentStatus}`)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </div>

      {tab === "details" && (
        <footer className="flex items-center gap-3 px-5 py-3 bg-white border-t border-[var(--line)]">
          {dirty ? (
            <span className="flex items-center gap-2 text-[13px] font-medium text-amber-700">
              <span className="size-2 rounded-full bg-amber-500" />
              {t("crm.lead.unsaved")}
            </span>
          ) : (
            <span className="text-[13px] muted">{lead.assignedTo ? staffById.get(lead.assignedTo)?.name : t("crm.common.unassigned")}</span>
          )}
          <div className="ms-auto flex gap-2">
            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={() => setForm(pickForm(lead))} disabled={saving}>
                <Undo2 className="size-4" />
                {t("crm.common.cancel")}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? <Spinner /> : <Check className="size-4" />}
              {saving ? t("crm.common.saving") : t("crm.common.save")}
            </button>
          </div>
        </footer>
      )}

      <BookingModal lead={lead} open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </>
  );
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (tags: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const tag = draft.trim().slice(0, 40);
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag]);
    setDraft("");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="input h-auto min-h-10 py-1.5 flex flex-wrap items-center gap-1.5 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]">
      {value.map((tag) => (
        <span key={tag} className="badge tone-neutral gap-1">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))} aria-label={`× ${tag}`} className="hover:text-rose-600">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input className="flex-1 min-w-24 bg-transparent outline-none text-sm h-6" value={draft} placeholder={value.length ? "" : placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={commit} />
    </div>
  );
}

// ── Conversation ─────────────────────────────────────────────────────────────
function Conversation({ lead }: { lead: Lead }) {
  const { t, locale } = useI18n();
  const { onMessage } = useCrm();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [failed, setFailed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setMessages(null);
    setFailed(false);
    api<Message[]>("messages.list", { leadId: lead.id })
      .then((list) => alive && setMessages(list))
      .catch(() => alive && setFailed(true));
    const off = onMessage((message, op) => {
      if (message.leadId !== lead.id && op !== "delete") return;
      setMessages((current) => {
        if (!current) return current;
        if (op === "delete") return current.filter((m) => m.id !== message.id);
        if (!message.processed) return current;
        const without = current.filter((m) => m.id !== message.id);
        return [...without, message].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, [lead.id, onMessage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  let lastDay = "";
  return (
    <div className="p-5">
      <p className="flex gap-2 rounded-xl bg-white border border-[var(--line)] px-3.5 py-2.5 text-[13px] text-navy-600 leading-relaxed">
        <MessageCircle className="size-4 mt-0.5 shrink-0 text-emerald-600" />
        {t("crm.lead.conversationNote")}
      </p>

      {failed && <p className="mt-6 text-sm text-rose-700 text-center">{t("crm.errors.server_error")}</p>}
      {!messages && !failed && <SkeletonRows rows={4} />}
      {messages?.length === 0 && <EmptyState compact icon={MessageCircle} title={t("crm.lead.noMessages")} hint={t("crm.lead.noMessagesHint")} />}

      <ol className="mt-5 grid gap-2">
        {messages?.map((message) => {
          const day = dayKey(message.timestamp);
          const showDay = day !== lastDay;
          lastDay = day;
          const outbound = message.direction === "outbound";
          return (
            <li key={message.id} className="grid gap-2">
              {showDay && (
                <p className="justify-self-center mt-2 text-[11px] font-semibold muted bg-white border border-[var(--line)] rounded-full px-3 py-0.5">
                  {formatDate(message.timestamp, locale, "long")}
                </p>
              )}
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_1px_rgb(17_26_48/0.05)]", outbound ? "justify-self-end bg-emerald-600 text-white rounded-ee-md" : "justify-self-start bg-white border border-[var(--line)] rounded-es-md")}>
                {(message.type === "website_form" || message.isHistory) && (
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", outbound ? "text-emerald-100" : "text-teal-700")}>
                    {message.type === "website_form" ? t("crm.lead.websiteForm") : t("crm.lead.history")}
                  </p>
                )}
                {message.referral && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs rounded-lg bg-gold-100 text-gold-600 px-2 py-1">
                    <Megaphone className="size-3.5 shrink-0" />
                    <span className="truncate">{message.referral.headline ?? t("crm.lead.ad")}</span>
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words leading-relaxed" dir="auto">{message.body || "—"}</p>
                <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px] tabular", outbound ? "text-emerald-100" : "muted")}>
                  {outbound ? t("crm.lead.sideAgency") : t("crm.lead.sideCustomer")} · {formatTime(message.timestamp, locale)}
                  {outbound && message.status === "read" && <CheckCheck className="size-3" />}
                  {message.isDemo && <span className="font-bold">· {t("crm.common.demo")}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

// ── Follow-ups ───────────────────────────────────────────────────────────────
function FollowUpList({ followUps }: { followUps: FollowUp[] }) {
  const { t, locale } = useI18n();
  const { apply, staffById } = useCrm();
  const toast = useToast();
  const toggle = async (followUp: FollowUp) => {
    try {
      apply("followups", await api<FollowUp>("followups.update", { id: followUp.id, done: followUp.status !== "done" }));
    } catch (error) {
      toast.error(errorMessage(t, error));
    }
  };
  if (!followUps.length) return <p className="text-sm muted">{t("crm.lead.noFollowUps")}</p>;
  const now = Date.now();
  return (
    <ul className="grid gap-2">
      {followUps.map((f) => {
        const done = f.status === "done";
        const overdue = !done && new Date(f.dueAt).getTime() < now;
        return (
          <li key={f.id} className={cn("flex items-center gap-3 rounded-xl border p-3", overdue ? "border-rose-200 bg-rose-50" : "border-[var(--line)]", done && "opacity-60")}>
            <CalendarClock className={cn("size-4 shrink-0", overdue ? "text-rose-600" : "text-navy-400")} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", done && "line-through")}>{t(`crm.reason.${f.reason}`)} · {formatDateTime(f.dueAt, locale)}</p>
              <p className="text-xs muted truncate">{[f.assignedTo ? staffById.get(f.assignedTo)?.name : null, f.notes].filter(Boolean).join(" — ")}</p>
            </div>
            {overdue && <Badge tone="rose">{t("crm.leads.overdue")}</Badge>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggle(f)}>
              {done ? t("crm.lead.reopen") : t("crm.lead.markDone")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FollowUpForm({ lead }: { lead: Lead }) {
  const { t } = useI18n();
  const { apply } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const tomorrow = useMemo(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(10, 0, 0, 0);
    return toLocalInput(d.toISOString());
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const created = await api<FollowUp>("followups.create", {
        leadId: lead.id,
        dueAt: new Date(String(form.get("dueAt"))).toISOString(),
        reason: form.get("reason"),
        notes: String(form.get("notes") ?? "") || null,
      });
      apply("followups", created);
      formEl.reset();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-[var(--line)] grid grid-cols-2 gap-3">
      <p className="col-span-2 text-sm font-semibold">{t("crm.lead.scheduleFollowUp")}</p>
      <Field label={t("crm.lead.followUpDate")}>
        <input name="dueAt" type="datetime-local" required defaultValue={tomorrow} className="input" />
      </Field>
      <Field label={t("crm.lead.followUpReason")}>
        <select name="reason" className="input" defaultValue="call_back">
          {FOLLOWUP_REASONS.map((r) => <option key={r} value={r}>{t(`crm.reason.${r}`)}</option>)}
        </select>
      </Field>
      <Field label={t("crm.common.notes")} className="col-span-2" optional>
        <input name="notes" className="input" maxLength={1000} />
      </Field>
      <button type="submit" className="btn btn-navy col-span-2 justify-self-start" disabled={busy}>
        {busy ? <Spinner /> : <Plus className="size-4" />}
        {t("crm.lead.schedule")}
      </button>
    </form>
  );
}

// ── Convert to booking ───────────────────────────────────────────────────────
export function BookingModal({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { data, packageById, apply } = useCrm();
  const toast = useToast();
  const today = dayKey(new Date());
  const options = useMemo(
    () =>
      data.departures
        .filter((d) => d.status === "open" && d.departDate >= today)
        .map((d) => ({ d, pkg: packageById.get(d.packageId), left: d.capacity - (data.seatsTaken[d.id] ?? 0) }))
        .filter((o) => o.pkg && o.left > 0)
        .sort((a, b) => Number(b.d.packageId === lead.packageId) - Number(a.d.packageId === lead.packageId) || a.d.departDate.localeCompare(b.d.departDate)),
    [data.departures, data.seatsTaken, packageById, lead.packageId, today],
  );
  const [departureId, setDepartureId] = useState("");
  const [travelers, setTravelers] = useState(Math.max(1, (lead.adults ?? 0) + (lead.children ?? 0)));
  const [total, setTotal] = useState<number | "">("");
  const [paid, setPaid] = useState<number | "">(0);
  const [busy, setBusy] = useState(false);

  const selected = options.find((o) => o.d.id === departureId);
  const unit = selected ? (selected.d.priceDzd ?? selected.pkg!.priceDzd ?? 0) : 0;
  useEffect(() => {
    if (open && !departureId && options[0]) setDepartureId(options[0].d.id);
  }, [open, departureId, options]);
  useEffect(() => {
    if (selected) setTotal(unit * travelers); // suggestion; the employee can overwrite it
  }, [departureId, travelers]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const booking = await api<Booking>("bookings.create", {
        leadId: lead.id,
        departureId,
        travelers,
        totalDzd: Number(total || 0),
        paidDzd: Number(paid || 0),
        bookingDate: String(form.get("bookingDate")),
        notes: String(form.get("notes") ?? "") || null,
      });
      apply("bookings", booking);
      toast.success(t("crm.booking.created"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("crm.booking.createTitle")} subtitle={leadName(lead)}>
      {options.length === 0 ? (
        <p className="text-sm muted">{t("crm.booking.noOpen")}</p>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Field label={t("crm.booking.departure")} className="col-span-2" hint={selected ? t("crm.booking.seatsLeft", { n: selected.left }) : undefined}>
            <select className="input" value={departureId} onChange={(e) => setDepartureId(e.target.value)} required>
              {options.map(({ d, pkg, left }) => (
                <option key={d.id} value={d.id}>
                  {pkg!.name} — {formatDate(d.departDate, locale)} ({t("crm.booking.seatsLeft", { n: left })})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("crm.booking.travelers")}>
            <input type="number" min={1} max={selected?.left ?? 100} required className="input" value={travelers} onChange={(e) => setTravelers(Math.max(1, Number(e.target.value)))} />
          </Field>
          <Field label={t("crm.booking.date")}>
            <input name="bookingDate" type="date" required defaultValue={today} className="input" />
          </Field>
          <Field label={t("crm.booking.total")} hint={formatDzd(Number(total || 0), locale)}>
            <input type="number" min={0} step={1000} required dir="ltr" className="input" value={total} onChange={(e) => setTotal(e.target.value === "" ? "" : Number(e.target.value))} />
          </Field>
          <Field label={t("crm.booking.paid")} hint={`${t("crm.booking.remaining")}: ${formatDzd(Math.max(0, Number(total || 0) - Number(paid || 0)), locale)}`}>
            <input type="number" min={0} max={Number(total || 0)} step={1000} dir="ltr" className="input" value={paid} onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))} />
          </Field>
          <Field label={t("crm.common.notes")} className="col-span-2" optional>
            <textarea name="notes" rows={2} className="input" maxLength={2000} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !departureId}>
              {busy && <Spinner />}
              {t("crm.booking.submit")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
