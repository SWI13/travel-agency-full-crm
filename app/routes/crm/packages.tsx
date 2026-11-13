import { useMemo, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, BedDouble, CalendarDays, Clock, ExternalLink, Globe, MapPin, Package as PackageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { PACKAGE_CATEGORIES, PACKAGE_STATUSES, ROOM_TYPES, type PackageStatus, type RoomType } from "~/lib/constants";
import { cn, dayKey, formatDate, formatDzd } from "~/lib/format";
import { seatsFor } from "~/lib/stats";
import type { Package } from "~/lib/types";
import { Badge, DemoBadge, EmptyState, Field, Modal, PageHeader, Spinner } from "~/ui";
import { useConfirm, useToast } from "~/ui/feedback";

const STATUS_TONE: Record<PackageStatus, string> = { draft: "neutral", active: "emerald", sold_out: "amber", archived: "neutral" };

export default function PackagesPage() {
  const { t, locale } = useI18n();
  const { data, can, apply, drop, run } = useCrm();
  const confirm = useConfirm();
  const manage = can("catalog.manage");
  const [editing, setEditing] = useState<Package | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const today = dayKey(new Date());

  const cards = useMemo(
    () =>
      data.packages
        .filter((p) => showArchived || p.status !== "archived")
        .map((pkg) => {
          const departures = data.departures
            .filter((d) => d.packageId === pkg.id && d.departDate >= today && d.status === "open")
            .sort((a, b) => a.departDate.localeCompare(b.departDate));
          const available = departures.reduce((sum, d) => sum + seatsFor(d, data.seatsTaken).left, 0);
          return { pkg, departures, available };
        })
        .sort((a, b) => Number(a.pkg.status === "archived") - Number(b.pkg.status === "archived") || a.pkg.name.localeCompare(b.pkg.name)),
    [data.packages, data.departures, data.seatsTaken, showArchived, today],
  );
  const archivedCount = data.packages.filter((p) => p.status === "archived").length;

  const setStatus = async (pkg: Package, status: PackageStatus) => {
    const { id, createdAt, updatedAt, slug, refCode, isDemo, ...fields } = pkg;
    const updated = await run<Package>("packages.save", { id, ...fields, status });
    if (updated) apply("packages", updated);
  };
  const remove = async (pkg: Package) => {
    if (!(await confirm({ title: t("crm.packages.delete"), body: t("crm.packages.deleteConfirm", { name: pkg.name }), danger: true, confirmLabel: t("crm.common.delete") }))) return;
    if ((await run("packages.delete", { id: pkg.id })) !== undefined) drop("packages", pkg.id);
  };

  return (
    <PageBody>
      <PageHeader
        title={t("crm.packages.title")}
        subtitle={manage ? t("crm.packages.subtitle") : t("crm.packages.readOnly")}
        actions={
          <>
            {archivedCount > 0 && (
              <label className="flex items-center gap-2 text-sm muted">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                {t("crm.packages.showArchived")} ({archivedCount})
              </label>
            )}
            {manage && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                {t("crm.packages.new")}
              </button>
            )}
          </>
        }
      />

      {cards.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={PackageIcon}
            title={t("crm.packages.empty")}
            hint={manage ? t("crm.packages.emptyHint") : undefined}
            action={manage && <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}><Plus className="size-4" />{t("crm.packages.new")}</button>}
          />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ pkg, departures, available }) => (
            <article key={pkg.id} className={cn("panel overflow-hidden flex flex-col", pkg.status === "archived" && "opacity-70")}>
              <div className="relative h-32 bg-gradient-to-br from-navy-900 via-navy-800 to-emerald-800">
                {pkg.coverImage ? <img src={pkg.coverImage} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 pattern-star" aria-hidden="true" />}
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/60 to-transparent" aria-hidden="true" />
                <div className="absolute top-3 start-3 flex flex-wrap gap-1.5">
                  <Badge tone={pkg.category === "hajj" ? "gold" : "teal"}>{t(`crm.service.${pkg.category}`)}</Badge>
                  <Badge tone={STATUS_TONE[pkg.status]} dot>{t(`crm.pkgStatus.${pkg.status}`)}</Badge>
                  <DemoBadge show={pkg.isDemo} />
                </div>
                <span className="absolute bottom-3 end-3 ltr-inline font-mono text-[11px] font-semibold text-white/90 bg-navy-950/50 rounded px-1.5 py-0.5">{pkg.refCode}</span>
              </div>
              <div className="flex-1 flex flex-col p-5">
                <h2 className="font-display text-lg font-semibold leading-snug">{pkg.name}</h2>
                {pkg.nameAr && <p className="text-sm muted" dir="rtl" lang="ar">{pkg.nameAr}</p>}
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] muted">
                  {pkg.durationDays && <li className="flex items-center gap-1.5"><Clock className="size-3.5" />{t("site.packages.days", { n: pkg.durationDays })}</li>}
                  {pkg.departureCity && <li className="flex items-center gap-1.5"><MapPin className="size-3.5" />{pkg.departureCity}</li>}
                  {pkg.hotelCategory && <li className="flex items-center gap-1.5"><BedDouble className="size-3.5" />{pkg.hotelCategory}</li>}
                </ul>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <dt className="muted">{t("crm.packages.nextDeparture")}</dt>
                    <dd className="font-semibold flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-emerald-600" />
                      {departures[0] ? formatDate(departures[0].departDate, locale) : <span className="muted font-normal">{t("crm.packages.noDepartures")}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted">{t("crm.packages.departures", { n: departures.length })}</dt>
                    <dd className={cn("font-semibold", departures.length > 0 && available === 0 && "text-rose-700")}>{t("crm.packages.available", { n: available })}</dd>
                  </div>
                </dl>
                <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold tabular">{formatDzd(pkg.priceDzd, locale)}</p>
                    <p className="text-[11px] muted">{t("crm.packages.perPerson")}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {pkg.status === "active" && (
                      <a href={`/${locale}/packages/${pkg.slug}`} target="_blank" rel="noopener noreferrer" className="icon-btn" title={t("crm.packages.viewOnSite")} aria-label={t("crm.packages.viewOnSite")}>
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                    {manage && (
                      <>
                        <button type="button" className="icon-btn" onClick={() => setEditing(pkg)} title={t("crm.packages.edit")} aria-label={t("crm.packages.edit")}>
                          <Pencil className="size-4" />
                        </button>
                        {pkg.status === "archived" ? (
                          <button type="button" className="icon-btn" onClick={() => setStatus(pkg, "draft")} title={t("crm.packages.restore")} aria-label={t("crm.packages.restore")}>
                            <ArchiveRestore className="size-4" />
                          </button>
                        ) : (
                          <button type="button" className="icon-btn" onClick={() => setStatus(pkg, "archived")} title={t("crm.packages.archive")} aria-label={t("crm.packages.archive")}>
                            <Archive className="size-4" />
                          </button>
                        )}
                        <button type="button" className="icon-btn hover:!text-rose-600" onClick={() => remove(pkg)} title={t("crm.packages.delete")} aria-label={t("crm.packages.delete")}>
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {pkg.status === "active" && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                    <Globe className="size-3.5" />
                    {t("crm.packages.onWebsite")}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <PackageForm pkg={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </PageBody>
  );
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim() || null;
const int = (form: FormData, key: string) => {
  const raw = String(form.get(key) ?? "").trim();
  return raw === "" ? null : Math.round(Number(raw));
};

function PackageForm({ pkg, onClose }: { pkg: Package | null; onClose: () => void }) {
  const { t } = useI18n();
  const { apply, reload } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<RoomType[]>((pkg?.roomOptions as RoomType[]) ?? ["double", "triple", "quad"]);
  const f = "crm.packages.form";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const departDate = text(form, "departDate");
    setBusy(true);
    try {
      const saved = await api<Package>("packages.save", {
        id: pkg?.id,
        name: String(form.get("name")),
        nameAr: text(form, "nameAr"),
        category: form.get("category"),
        status: form.get("status"),
        description: text(form, "description"),
        descriptionAr: text(form, "descriptionAr"),
        durationDays: int(form, "durationDays"),
        departureCity: text(form, "departureCity"),
        flightInfo: text(form, "flightInfo"),
        airline: text(form, "airline"),
        directFlight: form.get("directFlight") === "yes" ? true : form.get("directFlight") === "no" ? false : null,
        makkahHotel: text(form, "makkahHotel"),
        makkahArea: text(form, "makkahArea"),
        haramDistanceM: int(form, "haramDistanceM"),
        walkMinutes: text(form, "walkMinutes"),
        madinahHotel: text(form, "madinahHotel"),
        hotelCategory: text(form, "hotelCategory"),
        transport: text(form, "transport"),
        roomOptions: rooms,
        priceDzd: int(form, "priceDzd"),
        defaultCapacity: int(form, "defaultCapacity"),
        coverImage: text(form, "coverImage"),
        firstDeparture: !pkg && departDate ? { departDate, returnDate: text(form, "returnDate") } : null,
      });
      apply("packages", saved);
      if (!pkg && departDate) await reload().catch(() => {}); // pick up the first departure
      toast.success(t("crm.common.saved"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={pkg ? t("crm.packages.edit") : t("crm.packages.new")} subtitle={t(`${f}.accuracy`)}>
      <form onSubmit={submit} className="grid gap-6">
        <fieldset className="grid sm:grid-cols-2 gap-4">
          <legend className="eyebrow mb-3">{t(`${f}.basics`)}</legend>
          <Field label={t(`${f}.name`)}><input name="name" required minLength={2} maxLength={160} defaultValue={pkg?.name} className="input" /></Field>
          <Field label={t(`${f}.nameAr`)} optional><input name="nameAr" dir="rtl" lang="ar" maxLength={160} defaultValue={pkg?.nameAr ?? ""} className="input" /></Field>
          <Field label={t(`${f}.category`)}>
            <select name="category" className="input" defaultValue={pkg?.category ?? "umrah"}>
              {PACKAGE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`crm.service.${c}`)}</option>)}
            </select>
          </Field>
          <Field label={t(`${f}.status`)} hint={t(`${f}.statusHint`)}>
            <select name="status" className="input" defaultValue={pkg?.status ?? "draft"}>
              {PACKAGE_STATUSES.map((s) => <option key={s} value={s}>{t(`crm.pkgStatus.${s}`)}</option>)}
            </select>
          </Field>
          <Field label={t(`${f}.description`)} className="sm:col-span-2" optional><textarea name="description" rows={3} maxLength={5000} defaultValue={pkg?.description ?? ""} className="input" /></Field>
          <Field label={t(`${f}.descriptionAr`)} className="sm:col-span-2" optional><textarea name="descriptionAr" rows={3} dir="rtl" lang="ar" maxLength={5000} defaultValue={pkg?.descriptionAr ?? ""} className="input" /></Field>
        </fieldset>

        <fieldset className="grid sm:grid-cols-2 gap-4">
          <legend className="eyebrow mb-3">{t(`${f}.stay`)}</legend>
          <Field label={t(`${f}.duration`)}><input name="durationDays" type="number" min={1} max={120} defaultValue={pkg?.durationDays ?? ""} className="input" /></Field>
          <Field label={t(`${f}.city`)}><input name="departureCity" maxLength={80} defaultValue={pkg?.departureCity ?? ""} className="input" /></Field>
          <Field label={t(`${f}.makkah`)}><input name="makkahHotel" maxLength={200} defaultValue={pkg?.makkahHotel ?? ""} className="input" /></Field>
          <Field label={t(`${f}.madinah`)}><input name="madinahHotel" maxLength={200} defaultValue={pkg?.madinahHotel ?? ""} className="input" /></Field>
          <Field label={t(`${f}.hotelCategory`)}><input name="hotelCategory" maxLength={60} defaultValue={pkg?.hotelCategory ?? ""} placeholder="4★" className="input" /></Field>
          <Field label={t(`${f}.area`)} optional><input name="makkahArea" maxLength={80} defaultValue={pkg?.makkahArea ?? ""} className="input" /></Field>
          <Field label={t(`${f}.distance`)} optional><input name="haramDistanceM" type="number" min={0} max={50000} step={50} dir="ltr" defaultValue={pkg?.haramDistanceM ?? ""} className="input" /></Field>
          <Field label={t(`${f}.walk`)} hint={t(`${f}.walkHint`)} optional><input name="walkMinutes" maxLength={12} dir="ltr" defaultValue={pkg?.walkMinutes ?? ""} className="input" /></Field>
          <Field label={t(`${f}.airline`)} optional><input name="airline" maxLength={80} defaultValue={pkg?.airline ?? ""} className="input" /></Field>
          <Field label={t(`${f}.flightType`)}>
            <select name="directFlight" className="input" defaultValue={pkg?.directFlight === true ? "yes" : pkg?.directFlight === false ? "no" : ""}>
              <option value="">{t(`${f}.notSpecified`)}</option>
              <option value="yes">{t(`${f}.direct`)}</option>
              <option value="no">{t(`${f}.indirect`)}</option>
            </select>
          </Field>
          <Field label={t(`${f}.flight`)}><input name="flightInfo" maxLength={400} defaultValue={pkg?.flightInfo ?? ""} className="input" /></Field>
          <Field label={t(`${f}.transport`)} className="sm:col-span-2"><input name="transport" maxLength={300} defaultValue={pkg?.transport ?? ""} className="input" /></Field>
          <div className="sm:col-span-2">
            <span className="field-label">{t(`${f}.rooms`)}</span>
            <div className="flex flex-wrap gap-2">
              {ROOM_TYPES.map((room) => {
                const on = rooms.includes(room);
                return (
                  <button key={room} type="button" aria-pressed={on} onClick={() => setRooms((list) => (on ? list.filter((r) => r !== room) : [...list, room]))} className={cn("btn btn-sm", on ? "btn-navy" : "btn-secondary")}>
                    {t(`crm.room.${room}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

        <fieldset className="grid sm:grid-cols-2 gap-4">
          <legend className="eyebrow mb-3">{t(`${f}.pricing`)}</legend>
          <Field label={t(`${f}.price`)}><input name="priceDzd" type="number" min={0} step={1000} dir="ltr" defaultValue={pkg?.priceDzd ?? ""} className="input" /></Field>
          <Field label={t(`${f}.capacity`)}><input name="defaultCapacity" type="number" min={1} max={2000} defaultValue={pkg?.defaultCapacity ?? ""} className="input" /></Field>
          <Field label={t(`${f}.cover`)} hint={t(`${f}.coverHint`)} className="sm:col-span-2" optional><input name="coverImage" type="url" dir="ltr" maxLength={1000} defaultValue={pkg?.coverImage ?? ""} placeholder="https://" className="input" /></Field>
        </fieldset>

        {!pkg && (
          <fieldset className="grid sm:grid-cols-2 gap-4">
            <legend className="eyebrow mb-1">{t(`${f}.firstDeparture`)}</legend>
            <p className="sm:col-span-2 text-[13px] muted -mt-1">{t(`${f}.firstDepartureHint`)}</p>
            <Field label={t(`${f}.departDate`)}><input name="departDate" type="date" className="input" /></Field>
            <Field label={t(`${f}.returnDate`)}><input name="returnDate" type="date" className="input" /></Field>
          </fieldset>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {busy ? t("crm.common.saving") : t("crm.common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
