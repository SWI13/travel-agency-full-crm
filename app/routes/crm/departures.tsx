import { useMemo, useState, type FormEvent } from "react";
import { Pencil, PlaneTakeoff, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { DEPARTURE_STATUSES, type DepartureStatus } from "~/lib/constants";
import { cn, dayKey, formatDate, formatDzd } from "~/lib/format";
import { seatsFor } from "~/lib/stats";
import type { Departure } from "~/lib/types";
import { Badge, DemoBadge, EmptyState, Field, Meter, Modal, PageHeader, Spinner } from "~/ui";
import { useConfirm, useToast } from "~/ui/feedback";

const STATUS_TONE: Record<DepartureStatus, string> = { open: "emerald", closed: "amber", departed: "navy", cancelled: "rose" };

export default function DeparturesPage() {
  const { t } = useI18n();
  const { data, can, drop, run } = useCrm();
  const confirm = useConfirm();
  const manage = can("catalog.manage");
  const [editing, setEditing] = useState<Departure | "new" | null>(null);
  const today = dayKey(new Date());

  const { upcoming, past } = useMemo(() => {
    const sorted = [...data.departures].sort((a, b) => a.departDate.localeCompare(b.departDate));
    const isPast = (d: Departure) => d.departDate < today || d.status === "departed" || d.status === "cancelled";
    return { upcoming: sorted.filter((d) => !isPast(d)), past: sorted.filter(isPast).reverse() };
  }, [data.departures, today]);

  const remove = async (departure: Departure) => {
    if (!(await confirm({ title: t("crm.common.delete"), body: t("crm.departures.deleteConfirm"), danger: true, confirmLabel: t("crm.common.delete") }))) return;
    if ((await run("departures.delete", { id: departure.id })) !== undefined) drop("departures", departure.id);
  };

  const canCreate = manage && data.packages.some((p) => p.status !== "archived");

  return (
    <PageBody>
      <PageHeader
        title={t("crm.departures.title")}
        subtitle={t("crm.departures.subtitle")}
        actions={
          manage && (
            <button type="button" className="btn btn-primary" disabled={!canCreate} title={canCreate ? undefined : t("crm.departures.needPackage")} onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t("crm.departures.new")}
            </button>
          )
        }
      />

      {data.departures.length === 0 ? (
        <div className="panel">
          <EmptyState icon={PlaneTakeoff} title={t("crm.departures.empty")} hint={manage ? (canCreate ? t("crm.departures.emptyHint") : t("crm.departures.needPackage")) : undefined} />
        </div>
      ) : (
        <div className="grid gap-8">
          <DepartureTable title={t("crm.departures.upcoming")} rows={upcoming} manage={manage} onEdit={setEditing} onDelete={remove} />
          {past.length > 0 && <DepartureTable title={t("crm.departures.past")} rows={past} manage={manage} onEdit={setEditing} onDelete={remove} dim />}
        </div>
      )}

      {editing && <DepartureForm departure={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </PageBody>
  );
}

function DepartureTable({ title, rows, manage, onEdit, onDelete, dim }: {
  title: string;
  rows: Departure[];
  manage: boolean;
  onEdit: (departure: Departure) => void;
  onDelete: (departure: Departure) => void;
  dim?: boolean;
}) {
  const { t, locale } = useI18n();
  const { data, packageById } = useCrm();
  const th = "crm.departures.th";
  return (
    <section className="min-w-0">
      <h2 className="font-display text-lg font-semibold mb-3">
        {title} <span className="muted font-sans text-sm font-normal tabular">· {rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm muted">{t("crm.overview.noDepartures")}</p>
      ) : (
        <div className={cn("panel overflow-x-auto scroll-thin", dim && "opacity-75")}>
          <table className="data-table min-w-[56rem]">
            <thead>
              <tr>
                <th>{t(`${th}.package`)}</th>
                <th>{t(`${th}.dates`)}</th>
                <th>{t(`${th}.city`)}</th>
                <th className="w-56">{t(`${th}.occupancy`)}</th>
                <th>{t(`${th}.price`)}</th>
                <th>{t(`${th}.status`)}</th>
                {manage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((departure) => {
                const pkg = packageById.get(departure.packageId);
                const seats = seatsFor(departure, data.seatsTaken);
                const ratio = seats.capacity ? seats.booked / seats.capacity : 0;
                return (
                  <tr key={departure.id}>
                    <td>
                      <p className="font-semibold flex items-center gap-1.5">{pkg?.name ?? "—"} <DemoBadge show={departure.isDemo} /></p>
                      <p className="text-xs muted">{departure.groupName ?? t(`crm.service.${pkg?.category ?? "unknown"}`)}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      <p className="font-medium">{formatDate(departure.departDate, locale)}</p>
                      <p className="text-xs muted">→ {formatDate(departure.returnDate, locale)}</p>
                    </td>
                    <td>{departure.departureCity ?? pkg?.departureCity ?? "—"}</td>
                    <td>
                      <Meter value={seats.booked} max={seats.capacity} tone={ratio >= 1 ? "rose" : ratio >= 0.8 ? "amber" : "emerald"} />
                      <p className="mt-1.5 flex justify-between text-xs tabular">
                        <span className="muted">{t("crm.departures.booked", { n: seats.booked })} / {seats.capacity}</span>
                        <span className={cn("font-semibold", seats.left === 0 ? "text-rose-700" : "text-emerald-700")}>{seats.left === 0 ? t("crm.departures.full") : t("crm.departures.left", { n: seats.left })}</span>
                      </p>
                    </td>
                    <td className="tabular whitespace-nowrap">{formatDzd(departure.priceDzd ?? pkg?.priceDzd, locale)}</td>
                    <td><Badge tone={STATUS_TONE[departure.status]} dot>{t(`crm.depStatus.${departure.status}`)}</Badge></td>
                    {manage && (
                      <td className="text-end whitespace-nowrap">
                        <button type="button" className="icon-btn" onClick={() => onEdit(departure)} aria-label={t("crm.common.edit")} title={t("crm.common.edit")}><Pencil className="size-4" /></button>
                        <button type="button" className="icon-btn hover:!text-rose-600" onClick={() => onDelete(departure)} aria-label={t("crm.common.delete")} title={t("crm.common.delete")}><Trash2 className="size-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DepartureForm({ departure, onClose }: { departure: Departure | null; onClose: () => void }) {
  const { t } = useI18n();
  const { data, apply, packageById } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const packages = data.packages.filter((p) => p.status !== "archived" || p.id === departure?.packageId);
  const [packageId, setPackageId] = useState(departure?.packageId ?? packages[0]?.id ?? "");
  const pkg = packageById.get(packageId);
  const f = "crm.departures.form";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim() || null;
    setBusy(true);
    try {
      const saved = await api<Departure>("departures.save", {
        id: departure?.id,
        packageId,
        groupName: value("groupName"),
        departDate: String(form.get("departDate")),
        returnDate: value("returnDate"),
        departureCity: value("departureCity"),
        capacity: Number(form.get("capacity")),
        priceDzd: value("priceDzd") === null ? null : Number(form.get("priceDzd")),
        status: form.get("status"),
        flightInfo: value("flightInfo"),
        notes: value("notes"),
      });
      apply("departures", saved);
      toast.success(t("crm.common.saved"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={departure ? `${t("crm.common.edit")} — ${t(`${f}.title`)}` : t("crm.departures.new")}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label={t(`${f}.package`)} className="col-span-2">
          <select className="input" value={packageId} onChange={(e) => setPackageId(e.target.value)} required disabled={!!departure}>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t(`${f}.departDate`)}><input name="departDate" type="date" required defaultValue={departure?.departDate} className="input" /></Field>
        <Field label={t(`${f}.returnDate`)}><input name="returnDate" type="date" defaultValue={departure?.returnDate ?? ""} className="input" /></Field>
        <Field label={t(`${f}.capacity`)}><input name="capacity" type="number" min={1} max={2000} required key={packageId} defaultValue={departure?.capacity ?? pkg?.defaultCapacity ?? 40} className="input" /></Field>
        <Field label={t("crm.common.status")}>
          <select name="status" className="input" defaultValue={departure?.status ?? "open"}>
            {DEPARTURE_STATUSES.map((s) => <option key={s} value={s}>{t(`crm.depStatus.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t(`${f}.price`)} hint={t(`${f}.priceHint`)} className="col-span-2">
          <input name="priceDzd" type="number" min={0} step={1000} dir="ltr" defaultValue={departure?.priceDzd ?? ""} placeholder={pkg?.priceDzd ? String(pkg.priceDzd) : ""} className="input" />
        </Field>
        <Field label={t(`${f}.group`)} optional><input name="groupName" maxLength={120} defaultValue={departure?.groupName ?? ""} className="input" /></Field>
        <Field label={t(`${f}.city`)} optional><input name="departureCity" maxLength={80} defaultValue={departure?.departureCity ?? ""} placeholder={pkg?.departureCity ?? ""} className="input" /></Field>
        <Field label={t(`${f}.flight`)} className="col-span-2" optional><input name="flightInfo" maxLength={400} defaultValue={departure?.flightInfo ?? ""} className="input" /></Field>
        <Field label={t("crm.common.notes")} className="col-span-2" optional><textarea name="notes" rows={2} maxLength={2000} defaultValue={departure?.notes ?? ""} className="input" /></Field>
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !packageId}>
            {busy && <Spinner />}
            {t("crm.common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
