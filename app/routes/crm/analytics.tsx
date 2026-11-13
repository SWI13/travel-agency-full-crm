import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { ColumnChart } from "~/crm/charts";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { cn, formatDate, formatDzd, formatNumber, intlLocale } from "~/lib/format";
import { analytics, leadsSeries, rangeForDays, type Bucket, type DateRange } from "~/lib/stats";
import { Avatar, DemoBadge, EmptyState, Meter, PageHeader, Segmented } from "~/ui";

// Syncfusion needs a licence key (a free community licence exists). Without one it shows a
// trial banner, so the built-in chart is used and the Syncfusion bundle is never downloaded.
const HAS_SYNCFUSION_LICENCE = Boolean(import.meta.env.VITE_SYNCFUSION_LICENSE_KEY);
const SyncfusionColumnChart = lazy(() => import("~/crm/syncfusion-chart"));

type Preset = "7" | "30" | "90" | "365" | "custom";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-5 py-4" title={hint}>
      <p className="text-[13px] muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular text-navy-900">{value}</p>
    </div>
  );
}

/** Ranked horizontal bars with the value always written out (so it doubles as the table view). */
function BarList({ rows, format }: { rows: Array<{ key: string; label: string; value: number; extra?: string }>; format?: (value: number) => string }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm muted py-4">{t("crm.analytics.noData")}</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate min-w-0">{row.label}</span>
            <span className="font-semibold tabular whitespace-nowrap">
              {format ? format(row.value) : row.value}
              {row.extra && <span className="muted font-normal"> · {row.extra}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-navy-900/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, children, className, aside }: { title: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={cn("panel p-5 min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function AnalyticsPage() {
  const { t, locale, isRtl } = useI18n();
  const { data } = useCrm();
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState<DateRange>(() => rangeForDays(30));
  const [view, setView] = useState<"chart" | "table">("chart");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const range = useMemo(() => (preset === "custom" ? custom : rangeForDays(Number(preset))), [preset, custom]);
  const days = Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1;
  const bucket: Bucket = days <= 31 ? "day" : days <= 120 ? "week" : "month";

  const report = useMemo(() => analytics(data, range), [data, range]);
  const series = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), bucket === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
    return leadsSeries(data.leads, range, bucket).map((point) => ({
      ...point,
      label: fmt.format(new Date(`${point.key.length === 7 ? `${point.key}-01` : point.key}T12:00:00`)),
    }));
  }, [data.leads, range, bucket, locale]);

  const { totals } = report;
  const response =
    totals.medianResponseMinutes == null
      ? "—"
      : totals.medianResponseMinutes < 90
        ? t("crm.analytics.minutes", { n: Math.round(totals.medianResponseMinutes) })
        : t("crm.analytics.hours", { n: Math.round(totals.medianResponseMinutes / 60) });

  return (
    <PageBody>
      <PageHeader
        title={t("crm.analytics.title")}
        subtitle={t("crm.analytics.subtitle")}
        actions={
          <>
            <Segmented<Preset>
              value={preset}
              onChange={setPreset}
              options={[
                { value: "7", label: t("crm.analytics.d7") },
                { value: "30", label: t("crm.analytics.d30") },
                { value: "90", label: t("crm.analytics.d90") },
                { value: "365", label: t("crm.analytics.d365") },
                { value: "custom", label: t("crm.analytics.custom") },
              ]}
            />
            {preset === "custom" && (
              <span className="flex items-center gap-2">
                <input type="date" aria-label={t("crm.common.from")} className="input w-36" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
                <span className="muted">→</span>
                <input type="date" aria-label={t("crm.common.to")} className="input w-36" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
              </span>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--line)] shadow-soft">
        <Stat label={t("crm.analytics.kpiLeads")} value={formatNumber(totals.leads, locale)} />
        <Stat label={t("crm.analytics.kpiConversion")} hint={t("crm.analytics.kpiConversionHint")} value={totals.conversionRate == null ? "—" : `${(totals.conversionRate * 100).toFixed(1)} %`} />
        <Stat label={t("crm.analytics.kpiLost")} value={formatNumber(totals.lost, locale)} />
        <Stat label={t("crm.analytics.kpiRevenue")} value={formatDzd(totals.revenue, locale)} hint={`${t("crm.analytics.collected")}: ${formatDzd(totals.collected, locale)}`} />
        <Stat label={t("crm.analytics.kpiResponse")} value={response} />
      </div>

      <Card
        className="mt-6"
        title={`${t("crm.analytics.leadsOverTime")} · ${t(bucket === "day" ? "crm.analytics.perDay" : bucket === "week" ? "crm.analytics.perWeek" : "crm.analytics.perMonth")}`}
        aside={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: t("crm.analytics.leads"), icon: BarChart3 },
              { value: "table", label: t("crm.analytics.tableView"), icon: Table2 },
            ]}
          />
        }
      >
        {totals.leads === 0 ? (
          <EmptyState compact icon={BarChart3} title={t("crm.analytics.noData")} />
        ) : view === "table" ? (
          <div className="max-h-80 overflow-y-auto scroll-thin rounded-xl border border-[var(--line)]">
            <table className="data-table">
              <thead><tr><th>{t("crm.activity.th.when")}</th><th className="!text-end">{t("crm.analytics.leads")}</th></tr></thead>
              <tbody>
                {series.map((point) => (
                  <tr key={point.key}><td>{point.label}</td><td className="text-end tabular font-semibold">{point.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !HAS_SYNCFUSION_LICENCE ? (
          <ColumnChart data={series} seriesName={t("crm.analytics.leads")} />
        ) : mounted ? (
          <Suspense fallback={<div className="skeleton h-[300px]" />}>
            <SyncfusionColumnChart data={series} seriesName={t("crm.analytics.leads")} isRtl={isRtl} />
          </Suspense>
        ) : (
          <div className="skeleton h-[300px]" />
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card title={t("crm.analytics.serviceSplit")}>
          <BarList rows={report.byService.map((r) => ({ key: r.key, label: t(`crm.service.${r.key}`), value: r.count, extra: totals.leads ? `${Math.round((r.count / totals.leads) * 100)} %` : undefined }))} />
        </Card>
        <Card title={t("crm.analytics.bySource")}>
          <BarList rows={report.bySource.map((r) => ({ key: r.key, label: t(`crm.source.${r.key}`), value: r.count, extra: totals.leads ? `${Math.round((r.count / totals.leads) * 100)} %` : undefined }))} />
        </Card>
        <Card title={t("crm.analytics.lostReasons")}>
          {report.lostReasons.length === 0 ? (
            <p className="text-sm muted py-4">{t("crm.analytics.lostNone")}</p>
          ) : (
            <BarList rows={report.lostReasons.map((r) => ({ key: r.key || "none", label: r.key || t("crm.analytics.noReason"), value: r.count }))} />
          )}
        </Card>

        <Card title={t("crm.analytics.bookingsPerAgent")}>
          {report.bookingsPerAgent.length === 0 ? (
            <p className="text-sm muted py-4">{t("crm.analytics.noData")}</p>
          ) : (
            <ul className="grid gap-3">
              {report.bookingsPerAgent.map((row) => (
                <li key={row.staff.id} className="flex items-center gap-3 text-[13px]">
                  <Avatar name={row.staff.name} size="sm" />
                  <span className="flex-1 truncate font-medium">{row.staff.name}</span>
                  <span className="tabular font-semibold">{row.bookings}</span>
                  <span className="tabular muted whitespace-nowrap">{formatDzd(row.revenue, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("crm.analytics.topPackages")} className="xl:col-span-2">
          {report.topPackages.length === 0 ? (
            <p className="text-sm muted py-4">{t("crm.analytics.noData")}</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("crm.departures.th.package")}</th>
                    <th className="!text-end">{t("crm.analytics.bookings")}</th>
                    <th className="!text-end">{t("crm.analytics.travelers")}</th>
                    <th className="!text-end">{t("crm.analytics.revenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topPackages.map((row) => (
                    <tr key={row.pkg!.id}>
                      <td className="font-medium"><span className="flex items-center gap-1.5">{row.pkg!.name}<DemoBadge show={row.pkg!.isDemo} /></span></td>
                      <td className="text-end tabular">{row.bookings}</td>
                      <td className="text-end tabular">{row.travelers}</td>
                      <td className="text-end tabular font-semibold whitespace-nowrap">{formatDzd(row.revenue, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("crm.analytics.occupancy")} className="lg:col-span-2 xl:col-span-3">
          {report.occupancy.length === 0 ? (
            <p className="text-sm muted py-4">{t("crm.overview.noDepartures")}</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {report.occupancy.map(({ departure, pkg, booked, capacity, left }) => (
                <li key={departure.id} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate min-w-0 font-medium">{pkg?.name ?? "—"} · <span className="muted font-normal">{formatDate(departure.departDate, locale)}</span></span>
                    <span className="tabular whitespace-nowrap"><b>{booked}</b> {t("crm.analytics.booked")} · {left} {t("crm.analytics.free")}</span>
                  </div>
                  <Meter className="mt-1.5 h-2" value={booked} max={capacity} tone={booked >= capacity ? "rose" : booked / capacity >= 0.8 ? "amber" : "emerald"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageBody>
  );
}
