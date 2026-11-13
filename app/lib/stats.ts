import {
  LEAD_STAGES,
  QUALIFIED_STAGES,
  VOID_PAYMENT_STATUSES,
  WON_STAGES,
  type LeadSource,
  type LeadStage,
} from "./constants";
import { dayKey } from "./format";
import type { Booking, Departure, FollowUp, Lead, Package, Pilgrim, Staff } from "./types";

/**
 * Every number shown on the Overview and Analytics pages is computed here from
 * database records. Pure functions: no I/O, easy to unit-test.
 */

const activeBooking = (b: Booking) => !VOID_PAYMENT_STATUSES.includes(b.paymentStatus);

export interface OverviewInput {
  leads: Lead[];
  bookings: Booking[];
  departures: Departure[];
  pilgrims: Pilgrim[];
  followups: FollowUp[];
}

export function overviewKpis(data: OverviewInput, now = new Date()) {
  const today = dayKey(now);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const active = data.bookings.filter(activeBooking);
  const activeIds = new Set(active.map((b) => b.id));
  const dueLeads = new Set(
    data.followups
      .filter((f) => f.status === "pending" && new Date(f.dueAt).getTime() <= endOfToday.getTime())
      .map((f) => f.leadId),
  );
  return {
    totalLeads: data.leads.length,
    /** Conversations that started on WhatsApp today (manual and form entries excluded). */
    newToday: data.leads.filter(
      (l) => dayKey(l.createdAt) === today && l.source !== "manual" && l.source !== "website_form",
    ).length,
    unassigned: data.leads.filter((l) => !l.assignedTo && !WON_STAGES.includes(l.stage) && l.stage !== "lost").length,
    /** Leads with a pending follow-up that is due today or already overdue. */
    awaitingFollowUp: dueLeads.size,
    qualified: data.leads.filter((l) => QUALIFIED_STAGES.includes(l.stage)).length,
    confirmedBookings: active.length,
    upcomingDepartures: data.departures.filter((d) => d.departDate >= today && d.status !== "cancelled" && d.status !== "departed").length,
    totalPilgrims: data.pilgrims.filter((p) => activeIds.has(p.bookingId)).length,
  };
}

export function pipelineCounts(leads: Lead[]): Array<{ stage: LeadStage; count: number }> {
  const counts = new Map<LeadStage, number>();
  for (const lead of leads) counts.set(lead.stage, (counts.get(lead.stage) ?? 0) + 1);
  return LEAD_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
}

export interface AgentPerformance {
  staff: Staff;
  received: number;
  contacted: number;
  converted: number;
  bookings: number;
}

/** received = leads assigned; contacted = answered or moved past New; converted = Confirmed or later. */
export function teamPerformance(leads: Lead[], staff: Staff[], bookings: Booking[] = []): AgentPerformance[] {
  return staff
    .map((member) => {
      const mine = leads.filter((l) => l.assignedTo === member.id);
      return {
        staff: member,
        received: mine.length,
        contacted: mine.filter((l) => l.stage !== "new" || !!l.firstResponseAt).length,
        converted: mine.filter((l) => WON_STAGES.includes(l.stage)).length,
        bookings: bookings.filter((b) => b.assignedTo === member.id && activeBooking(b)).length,
      };
    })
    .sort((a, b) => b.received - a.received || a.staff.name.localeCompare(b.staff.name));
}

export function seatsFor(departure: Departure, seatsTaken: Record<string, number>) {
  const booked = seatsTaken[departure.id] ?? 0;
  return { booked, left: Math.max(0, departure.capacity - booked), capacity: departure.capacity };
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface DateRange {
  from: string; // yyyy-mm-dd inclusive
  to: string; // yyyy-mm-dd inclusive
}

export const inRange = (iso: string, range: DateRange) => {
  const key = iso.length === 10 ? iso : dayKey(iso);
  return key >= range.from && key <= range.to;
};

export type Bucket = "day" | "week" | "month";

function bucketKey(date: Date, bucket: Bucket): string {
  if (bucket === "month") return dayKey(date).slice(0, 7);
  if (bucket === "week") {
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return dayKey(monday);
  }
  return dayKey(date);
}

/** Continuous series (empty buckets included) of leads created in the range. */
export function leadsSeries(leads: Lead[], range: DateRange, bucket: Bucket): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  const cursor = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  for (let guard = 0; cursor <= end && guard < 800; guard++) {
    counts.set(bucketKey(cursor, bucket), 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const lead of leads) {
    if (!inRange(lead.createdAt, range)) continue;
    const key = bucketKey(new Date(lead.createdAt), bucket);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));
}

export function countBy<T, K extends string>(items: T[], keyOf: (item: T) => K): Array<{ key: K; count: number }> {
  const counts = new Map<K, number>();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface AnalyticsInput {
  leads: Lead[];
  bookings: Booking[];
  packages: Package[];
  departures: Departure[];
  staff: Staff[];
  seatsTaken: Record<string, number>;
}

export function analytics(data: AnalyticsInput, range: DateRange, now = new Date()) {
  const leads = data.leads.filter((l) => inRange(l.createdAt, range));
  const bookings = data.bookings.filter((b) => inRange(b.bookingDate, range));
  const active = bookings.filter(activeBooking);
  const won = leads.filter((l) => WON_STAGES.includes(l.stage));
  const lost = leads.filter((l) => l.stage === "lost");
  const responseMinutes = leads
    .filter((l) => l.firstResponseAt && l.lastInboundAt)
    .map((l) => (new Date(l.firstResponseAt!).getTime() - new Date(l.createdAt).getTime()) / 60_000)
    .filter((m) => m >= 0);

  const perPackage = new Map<string, { bookings: number; travelers: number; revenue: number }>();
  for (const b of active) {
    const row = perPackage.get(b.packageId) ?? { bookings: 0, travelers: 0, revenue: 0 };
    row.bookings += 1;
    row.travelers += b.travelers;
    row.revenue += b.totalDzd;
    perPackage.set(b.packageId, row);
  }
  const today = dayKey(now);

  return {
    totals: {
      leads: leads.length,
      won: won.length,
      lost: lost.length,
      /** Share of the period's leads that reached Confirmed or later. */
      conversionRate: leads.length ? won.length / leads.length : null,
      revenue: active.reduce((sum, b) => sum + b.totalDzd, 0),
      collected: active.reduce((sum, b) => sum + b.paidDzd, 0),
      bookings: active.length,
      medianResponseMinutes: median(responseMinutes),
    },
    byService: countBy(leads, (l) => l.serviceType),
    bySource: countBy(leads, (l) => l.source as LeadSource),
    lostReasons: countBy(lost, (l) => (l.lostReason?.trim() || "") as string),
    bookingsPerAgent: data.staff
      .map((s) => {
        const mine = active.filter((b) => b.assignedTo === s.id);
        return { staff: s, bookings: mine.length, revenue: mine.reduce((sum, b) => sum + b.totalDzd, 0) };
      })
      .filter((row) => row.bookings > 0)
      .sort((a, b) => b.bookings - a.bookings),
    topPackages: [...perPackage]
      .map(([packageId, row]) => ({ pkg: data.packages.find((p) => p.id === packageId), ...row }))
      .filter((row) => row.pkg)
      .sort((a, b) => b.revenue - a.revenue),
    /** Not range-bound: what is coming up, whatever the selected period. */
    occupancy: data.departures
      .filter((d) => d.departDate >= today && d.status !== "cancelled")
      .sort((a, b) => a.departDate.localeCompare(b.departDate))
      .slice(0, 8)
      .map((d) => ({ departure: d, pkg: data.packages.find((p) => p.id === d.packageId), ...seatsFor(d, data.seatsTaken) })),
  };
}

export function rangeForDays(days: number, now = new Date()): DateRange {
  const from = new Date(now);
  from.setDate(now.getDate() - (days - 1));
  return { from: dayKey(from), to: dayKey(now) };
}
