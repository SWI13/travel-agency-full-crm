import { useMemo } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookCheck,
  CalendarClock,
  Inbox,
  MessageCircle,
  PlaneTakeoff,
  Sparkles,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { activityText } from "~/crm/activity-text";
import { SOURCE_TONE, STAGE_COLOR, STAGE_TONE } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { cn, dayKey, formatDate, formatNumber, leadName, timeAgo } from "~/lib/format";
import { formatPhone } from "~/lib/phone";
import { overviewKpis, pipelineCounts, seatsFor, teamPerformance } from "~/lib/stats";
import { Avatar, Badge, DemoBadge, EmptyState, Meter, PageHeader } from "~/ui";

function Kpi({ icon: Icon, label, value, to, attention }: { icon: LucideIcon; label: string; value: number; to: string; attention?: "amber" | "rose" }) {
  const { locale } = useI18n();
  return (
    <Link to={to} className="group relative flex flex-col gap-3 p-5 bg-white transition-colors hover:bg-sand-50">
      <div className="flex items-center justify-between">
        <span className="grid place-items-center size-9 rounded-xl bg-sand-100 text-navy-600 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
          <Icon className="size-[18px]" />
        </span>
        {attention && value > 0 && <span className={cn("size-2 rounded-full", attention === "rose" ? "bg-rose-500" : "bg-amber-500")} aria-hidden="true" />}
      </div>
      <div>
        <p className="font-display text-[2rem] leading-none font-semibold tabular text-navy-900">{formatNumber(value, locale)}</p>
        <p className="mt-1.5 text-[13px] muted">{label}</p>
      </div>
    </Link>
  );
}

function PanelTitle({ title, to, linkLabel }: { title: string; to?: string; linkLabel?: string }) {
  const { isRtl } = useI18n();
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 hover:underline">
          {linkLabel}
          <Arrow className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export default function Overview() {
  const { t, locale } = useI18n();
  const { data, can, staffById, packageById, openLead, highlighted } = useCrm();

  const kpis = useMemo(() => overviewKpis(data), [data]);
  const pipeline = useMemo(() => pipelineCounts(data.leads), [data.leads]);
  const maxStage = Math.max(1, ...pipeline.map((p) => p.count));
  const recent = useMemo(
    () => [...data.leads].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, 7),
    [data.leads],
  );
  const today = dayKey(new Date());
  const upcoming = useMemo(
    () =>
      data.departures
        .filter((d) => d.departDate >= today && d.status !== "cancelled" && d.status !== "departed")
        .sort((a, b) => a.departDate.localeCompare(b.departDate))
        .slice(0, 5),
    [data.departures, today],
  );
  const team = useMemo(
    () => teamPerformance(data.leads, data.staff.filter((s) => s.isActive), data.bookings).filter((row) => row.received > 0).slice(0, 6),
    [data.leads, data.staff, data.bookings],
  );

  return (
    <PageBody>
      <PageHeader
        title={t("crm.overview.greeting", { name: data.me.name.split(" ")[0] })}
        subtitle={can("leads.view_all") ? t("crm.overview.subtitle") : t("crm.overview.scopeMine")}
      />

      {/* KPI strip: one surface, hairline separators */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--line)] shadow-soft" aria-label={t("crm.overview.title")}>
        <Kpi icon={Inbox} label={t("crm.overview.kpi.totalLeads")} value={kpis.totalLeads} to="/admin/leads" />
        <Kpi icon={MessageCircle} label={t("crm.overview.kpi.newToday")} value={kpis.newToday} to="/admin/leads?created=today" />
        <Kpi icon={UserRoundX} label={t("crm.overview.kpi.unassigned")} value={kpis.unassigned} to="/admin/leads?agent=none" attention="amber" />
        <Kpi icon={CalendarClock} label={t("crm.overview.kpi.awaitingFollowUp")} value={kpis.awaitingFollowUp} to="/admin/follow-ups" attention="rose" />
        <Kpi icon={Sparkles} label={t("crm.overview.kpi.qualified")} value={kpis.qualified} to="/admin/leads" />
        <Kpi icon={BookCheck} label={t("crm.overview.kpi.confirmed")} value={kpis.confirmedBookings} to="/admin/bookings" />
        <Kpi icon={PlaneTakeoff} label={t("crm.overview.kpi.upcoming")} value={kpis.upcomingDepartures} to="/admin/departures" />
        <Kpi icon={UsersRound} label={t("crm.overview.kpi.pilgrims")} value={kpis.totalPilgrims} to="/admin/bookings?tab=pilgrims" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        {/* Recent leads */}
        <section className="panel overflow-hidden">
          <PanelTitle title={t("crm.overview.recentLeads")} to="/admin/leads" linkLabel={t("crm.overview.viewAll")} />
          {recent.length === 0 ? (
            <EmptyState compact icon={MessageCircle} title={t("crm.overview.noLeads")} hint={t("crm.overview.noLeadsHint")} />
          ) : (
            <ul>
              {recent.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => openLead(lead.id)}
                    className={cn(
                      "w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 text-start border-t border-[var(--line)] hover:bg-sand-50 transition-colors",
                      highlighted.has(lead.id) && "bg-emerald-50/70",
                    )}
                  >
                    <span className="relative">
                      <Avatar name={leadName(lead)} />
                      {lead.unreadCount > 0 && <span className="absolute -top-0.5 -end-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate" dir="auto">{leadName(lead)}</span>
                        <span className="text-xs muted ltr-inline hidden sm:inline">{formatPhone(lead.phone)}</span>
                        <DemoBadge show={lead.isDemo} />
                      </span>
                      <span className={cn("block text-[13px] truncate", lead.unreadCount > 0 ? "text-navy-800 font-medium" : "muted")} dir="auto">
                        {lead.lastMessageText ?? t("crm.leads.noMessage")}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={STAGE_TONE[lead.stage]} dot>{t(`crm.stage.${lead.stage}`)}</Badge>
                        {lead.serviceType !== "unknown" && <Badge tone="gold">{t(`crm.service.${lead.serviceType}`)}</Badge>}
                        <Badge tone={SOURCE_TONE[lead.source]}>{t(`crm.source.${lead.source}`)}</Badge>
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5">
                      <span className="text-xs muted whitespace-nowrap">{timeAgo(lead.lastActivityAt, locale)}</span>
                      {lead.assignedTo ? (
                        <Avatar name={staffById.get(lead.assignedTo)?.name} size="sm" />
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700">{t("crm.common.unassigned")}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sales pipeline */}
        <section className="panel">
          <PanelTitle title={t("crm.overview.pipeline")} to="/admin/leads" linkLabel={t("crm.overview.viewAll")} />
          <ul className="px-5 pb-5 grid gap-2.5">
            {pipeline.map(({ stage, count }) => (
              <li key={stage}>
                <Link to={`/admin/leads?stage=${stage}&view=table`} className="group grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3 text-[13px]">
                  <span className="truncate group-hover:text-navy-900 muted">{t(`crm.stage.${stage}`)}</span>
                  <span className="h-2 rounded-full bg-navy-900/[0.06] overflow-hidden">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(count / maxStage) * 100}%`, background: STAGE_COLOR[stage] }} />
                  </span>
                  <span className="text-end font-semibold tabular">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Upcoming departures */}
        <section className="panel">
          <PanelTitle title={t("crm.overview.upcomingDepartures")} to="/admin/departures" linkLabel={t("crm.overview.viewAll")} />
          {upcoming.length === 0 ? (
            <p className="px-5 pb-6 text-sm muted">{t("crm.overview.noDepartures")}</p>
          ) : (
            <ul className="px-5 pb-5 grid gap-4">
              {upcoming.map((departure) => {
                const pkg = packageById.get(departure.packageId);
                const seats = seatsFor(departure, data.seatsTaken);
                const ratio = seats.capacity ? seats.booked / seats.capacity : 0;
                return (
                  <li key={departure.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold truncate">{pkg?.name ?? "—"}</p>
                      <p className="text-xs muted whitespace-nowrap">{formatDate(departure.departDate, locale)}</p>
                    </div>
                    <Meter value={seats.booked} max={seats.capacity} tone={ratio >= 1 ? "rose" : ratio >= 0.8 ? "amber" : "emerald"} className="mt-2" />
                    <p className="mt-1.5 flex items-center justify-between text-xs muted">
                      <span>{t("crm.overview.seats", { booked: seats.booked, capacity: seats.capacity })}</span>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={pkg?.category === "hajj" ? "gold" : "teal"}>{t(`crm.service.${pkg?.category ?? "unknown"}`)}</Badge>
                        <DemoBadge show={departure.isDemo} />
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Team performance */}
        <section className="panel overflow-hidden">
          <PanelTitle title={t("crm.overview.teamPerformance")} to={can("team.view") ? "/admin/team" : undefined} linkLabel={t("crm.overview.viewAll")} />
          {team.length === 0 ? (
            <p className="px-5 pb-6 text-sm muted">{t("crm.overview.noTeam")}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("crm.team.th.employee")}</th>
                  <th className="!text-end">{t("crm.overview.received")}</th>
                  <th className="!text-end">{t("crm.overview.contacted")}</th>
                  <th className="!text-end">{t("crm.overview.converted")}</th>
                </tr>
              </thead>
              <tbody>
                {team.map((row) => (
                  <tr key={row.staff.id}>
                    <td>
                      <span className="flex items-center gap-2 min-w-0">
                        <Avatar name={row.staff.name} size="sm" />
                        <span className="truncate font-medium">{row.staff.name}</span>
                      </span>
                    </td>
                    <td className="text-end tabular">{row.received}</td>
                    <td className="text-end tabular">{row.contacted}</td>
                    <td className="text-end tabular font-semibold text-emerald-700">{row.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Recent activity */}
        <section className="panel lg:col-span-2 xl:col-span-1">
          <PanelTitle title={t("crm.overview.recentActivity")} to="/admin/activity" linkLabel={t("crm.overview.viewAll")} />
          {data.activity.length === 0 ? (
            <p className="px-5 pb-6 text-sm muted">{t("crm.overview.noActivity")}</p>
          ) : (
            <ol className="px-5 pb-5 grid gap-3.5">
              {data.activity.filter((a) => a.action !== "login").slice(0, 7).map((entry) => (
                <li key={entry.id} className="grid grid-cols-[auto_1fr] gap-3">
                  <span className={cn("mt-1.5 size-2 rounded-full", entry.action === "webhook_error" ? "bg-rose-500" : entry.actorType === "system" ? "bg-gold-400" : "bg-emerald-500")} />
                  <div className="min-w-0">
                    <p className="text-[13px]">
                      <span className="font-semibold">{t(`crm.activity.action.${entry.action}`)}</span>
                      <span className="muted"> · {entry.actorType === "system" ? t("crm.common.system") : entry.actorName}</span>
                    </p>
                    <p className="text-[13px] muted truncate" dir="auto">{activityText(entry, t, locale)}</p>
                    <p className="text-[11px] muted">{timeAgo(entry.createdAt, locale)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PageBody>
  );
}
