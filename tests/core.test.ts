import { describe, expect, it } from "vitest";
import { formatDzd, initials, leadName, slugify } from "~/lib/format";
import { can, canAccessAssigned, capabilitiesOf } from "~/lib/permissions";
import { formatPhone, maskPhone, normalizeDzPhone, waChatLink, waIdToE164 } from "~/lib/phone";
import { analytics, leadsSeries, median, overviewKpis, pipelineCounts, teamPerformance } from "~/lib/stats";
import type { Booking, Departure, FollowUp, Lead, Package, Pilgrim, Staff } from "~/lib/types";
import { paymentStatusFor } from "~/server/rpc/catalog";

describe("phone numbers", () => {
  it("normalises Algerian formats to E.164", () => {
    for (const input of ["0661 23 45 67", "0661-234-567", "+213661234567", "00213661234567", "213661234567", "+213 (0) 661 23 45 67"]) {
      expect(normalizeDzPhone(input), input).toBe("+213661234567");
    }
    expect(normalizeDzPhone("033 27 19 65")).toBe("+21333271965"); // landline
  });
  it("accepts foreign numbers only in international format", () => {
    expect(normalizeDzPhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizeDzPhone("0033612345678")).toBe("+33612345678");
  });
  it("rejects invalid numbers", () => {
    for (const input of ["", "abc", "0661", "1234567890", "0861234567", "+2136612345"]) {
      expect(normalizeDzPhone(input), input).toBeNull();
    }
  });
  it("converts WhatsApp ids, formats, masks and builds chat links", () => {
    expect(waIdToE164("213661234567")).toBe("+213661234567");
    expect(waIdToE164("")).toBeNull();
    expect(formatPhone("+213661234567")).toBe("+213 661 23 45 67");
    expect(maskPhone("+213661234567")).toBe("+21366•••••67");
    expect(waChatLink("+213661234567")).toBe("https://wa.me/213661234567");
    expect(waChatLink(null)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats DZD per language with western digits", () => {
    expect(formatDzd(285000, "fr")).toBe("285 000 DA");
    expect(formatDzd(285000, "ar")).toBe("285 000 دج");
    expect(formatDzd(285000, "en")).toBe("DZD 285,000");
    expect(formatDzd(null, "fr")).toBe("—");
  });
  it("prefers the employee's name, then WhatsApp name, then username, then phone", () => {
    expect(leadName({ displayName: "Mme Hadj", waName: "amina", phone: "+213661234567" })).toBe("Mme Hadj");
    expect(leadName({ displayName: null, waName: "amina", phone: "+213661234567" })).toBe("amina");
    expect(leadName({ waUsername: "amina.h" })).toBe("@amina.h");
    expect(leadName({ phone: "+213661234567" })).toContain("+213661234567");
    expect(leadName({})).toBe("—");
  });
  it("builds initials and slugs", () => {
    expect(initials("Sara (démo)")).toBe("S");
    expect(initials("karim benali")).toBe("KB");
    expect(slugify("Omra Économique 10 jours !")).toBe("omra-economique-10-jours");
  });
});

describe("role permissions", () => {
  it("gives admins everything", () => {
    for (const capability of ["team.manage", "integrations.manage", "settings.manage", "leads.delete", "reports.view"] as const) {
      expect(can("admin", capability)).toBe(true);
    }
  });
  it("lets managers run sales and catalogue but not administration", () => {
    expect(can("manager", "leads.view_all")).toBe(true);
    expect(can("manager", "leads.assign")).toBe(true);
    expect(can("manager", "catalog.manage")).toBe(true);
    expect(can("manager", "reports.view")).toBe(true);
    expect(can("manager", "team.manage")).toBe(false);
    expect(can("manager", "integrations.manage")).toBe(false);
    expect(can("manager", "settings.manage")).toBe(false);
  });
  it("limits agents to their own records", () => {
    expect(capabilitiesOf("agent")).toEqual(["leads.create"]);
    const agent = { id: "a1", role: "agent" as const };
    expect(canAccessAssigned(agent, "a1")).toBe(true);
    expect(canAccessAssigned(agent, "a2")).toBe(false);
    expect(canAccessAssigned(agent, null)).toBe(false);
    expect(canAccessAssigned({ id: "m1", role: "manager" }, "a2")).toBe(true);
  });
  it("denies unknown roles", () => {
    expect(can(undefined, "leads.view_all")).toBe(false);
  });
});

describe("payment status", () => {
  it("follows the amounts", () => {
    expect(paymentStatusFor(300000, 0)).toBe("unpaid");
    expect(paymentStatusFor(300000, 100000)).toBe("partial");
    expect(paymentStatusFor(300000, 300000)).toBe("paid");
  });
  it("keeps explicit refunded / cancelled decisions", () => {
    expect(paymentStatusFor(300000, 300000, "refunded")).toBe("refunded");
    expect(paymentStatusFor(300000, 0, "cancelled")).toBe("cancelled");
  });
});

// ── Statistics are computed from records, never hard-coded ───────────────────
const now = new Date("2026-11-13T12:00:00");
const iso = (daysAgo: number, hour = 10) => new Date(2026, 10, 13 - daysAgo, hour).toISOString();
const lead = (over: Partial<Lead>): Lead =>
  ({ id: Math.random().toString(36), createdAt: iso(0), stage: "new", source: "organic", serviceType: "unknown", assignedTo: null, firstResponseAt: null, lastInboundAt: null, lostReason: null, ...over }) as Lead;
const staff = (id: string, name: string): Staff => ({ id, name, email: `${id}@x`, role: "agent", isActive: true, lastLoginAt: null, createdAt: iso(30), updatedAt: iso(30) });

const leads: Lead[] = [
  lead({ id: "l1", source: "facebook_ad", serviceType: "umrah", assignedTo: "a1" }),
  lead({ id: "l2", source: "manual" }),
  lead({ id: "l3", createdAt: iso(3), stage: "qualified", assignedTo: "a1", firstResponseAt: iso(3, 11), lastInboundAt: iso(3) }),
  lead({ id: "l4", createdAt: iso(5), stage: "confirmed", assignedTo: "a2", serviceType: "hajj" }),
  lead({ id: "l5", createdAt: iso(6), stage: "lost", lostReason: "Prix", assignedTo: "a2" }),
  lead({ id: "l6", createdAt: iso(40), stage: "completed", assignedTo: "a1" }),
];
const bookings = [
  { id: "b1", leadId: "l4", packageId: "p1", departureId: "d1", travelers: 3, totalDzd: 900000, paidDzd: 300000, paymentStatus: "partial", bookingDate: "2026-11-10", assignedTo: "a2" },
  { id: "b2", leadId: "l6", packageId: "p1", departureId: "d1", travelers: 2, totalDzd: 600000, paidDzd: 600000, paymentStatus: "cancelled", bookingDate: "2026-11-11", assignedTo: "a1" },
] as Booking[];
const departures = [
  { id: "d1", packageId: "p1", departDate: "2026-12-01", capacity: 40, status: "open" },
  { id: "d2", packageId: "p1", departDate: "2026-10-01", capacity: 40, status: "departed" },
] as Departure[];
const pilgrims = [{ id: "pi1", bookingId: "b1" }, { id: "pi2", bookingId: "b1" }, { id: "pi3", bookingId: "b2" }] as Pilgrim[];
const followups = [
  { id: "f1", leadId: "l3", status: "pending", dueAt: iso(1) },
  { id: "f2", leadId: "l1", status: "pending", dueAt: new Date(2026, 10, 20).toISOString() },
  { id: "f3", leadId: "l5", status: "done", dueAt: iso(2) },
] as FollowUp[];

describe("overview KPIs", () => {
  const kpis = overviewKpis({ leads, bookings, departures, pilgrims, followups }, now);
  it("counts leads", () => {
    expect(kpis.totalLeads).toBe(6);
    expect(kpis.newToday).toBe(1); // the manual entry is not a WhatsApp lead
    expect(kpis.unassigned).toBe(1);
    expect(kpis.qualified).toBe(1);
  });
  it("counts only due follow-ups, active bookings, future departures and their pilgrims", () => {
    expect(kpis.awaitingFollowUp).toBe(1);
    expect(kpis.confirmedBookings).toBe(1); // the cancelled booking is excluded
    expect(kpis.upcomingDepartures).toBe(1);
    expect(kpis.totalPilgrims).toBe(2);
  });
  it("groups the pipeline and the team", () => {
    expect(pipelineCounts(leads).find((p) => p.stage === "new")?.count).toBe(2);
    const team = teamPerformance(leads, [staff("a1", "Sara"), staff("a2", "Walid")], bookings);
    expect(team.find((r) => r.staff.id === "a1")).toMatchObject({ received: 3, contacted: 2, converted: 1 });
    expect(team.find((r) => r.staff.id === "a2")).toMatchObject({ received: 2, contacted: 2, converted: 1, bookings: 1 });
  });
});

describe("analytics", () => {
  const range = { from: "2026-11-01", to: "2026-11-13" };
  const report = analytics(
    { leads, bookings, departures, packages: [{ id: "p1", name: "Omra" }] as Package[], staff: [staff("a1", "Sara"), staff("a2", "Walid")], seatsTaken: { d1: 3 } },
    range,
    now,
  );
  it("respects the date range", () => {
    expect(report.totals.leads).toBe(5); // the 40-day-old lead is outside
  });
  it("computes conversion, lost leads and revenue from confirmed bookings", () => {
    expect(report.totals.won).toBe(1);
    expect(report.totals.conversionRate).toBeCloseTo(0.2);
    expect(report.totals.lost).toBe(1);
    expect(report.totals.revenue).toBe(900000);
    expect(report.totals.collected).toBe(300000);
    expect(report.lostReasons).toEqual([{ key: "Prix", count: 1 }]);
  });
  it("breaks leads down by service and source", () => {
    expect(report.byService.find((r) => r.key === "hajj")?.count).toBe(1);
    expect(report.bySource.find((r) => r.key === "facebook_ad")?.count).toBe(1);
    expect(report.bookingsPerAgent).toHaveLength(1);
    expect(report.topPackages[0]).toMatchObject({ bookings: 1, travelers: 3, revenue: 900000 });
    expect(report.occupancy[0]).toMatchObject({ booked: 3, left: 37, capacity: 40 });
  });
  it("builds a continuous series including empty days", () => {
    const series = leadsSeries(leads, range, "day");
    expect(series).toHaveLength(13);
    expect(series.reduce((sum, point) => sum + point.count, 0)).toBe(5);
    expect(series.at(-1)).toEqual({ key: "2026-11-13", count: 2 });
  });
  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(report.totals.medianResponseMinutes).toBe(60);
  });
});
