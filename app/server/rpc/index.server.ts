import { can, capabilitiesOf } from "~/lib/permissions";
import type {
  Activity,
  Booking,
  Departure,
  FollowUp,
  Lead,
  Package,
  Pilgrim,
  SessionUser,
  Staff,
} from "~/lib/types";
import { db } from "../db.server";
import { env } from "../env.server";
import { badRequest, forbidden, HttpError } from "../errors";
import { getSettings } from "../session.server";
import { adminProcedures } from "./admin";
import { catalogProcedures } from "./catalog";
import type { Ctx, RpcDef } from "./core";
import { leadProcedures } from "./leads";

const procedures: Record<string, RpcDef<any>> = {
  ...leadProcedures,
  ...catalogProcedures,
  ...adminProcedures,
};

/** Single entry point: authorise, validate, run. */
export async function callProcedure(name: string, ctx: Ctx, rawInput: unknown): Promise<unknown> {
  if (name === "snapshot") return snapshot(ctx.user);
  const procedure = procedures[name];
  if (!procedure) throw new HttpError(404, "unknown_procedure", "Unknown action");
  if (procedure.cap && !can(ctx.user.role, procedure.cap)) throw forbidden();
  const parsed = procedure.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(issue?.message ?? "Invalid input", { field: issue?.path.join(".") ?? null });
  }
  return procedure.run(ctx, parsed.data);
}

/**
 * Everything the dashboard needs after sign-in, already filtered by role:
 * agents receive only the records assigned to them.
 */
export async function snapshot(user: SessionUser) {
  const all = can(user.role, "leads.view_all");
  const mine = { where: { assignedTo: user.id } };
  const [settings, staff, leads, packages, departures, bookings, pilgrims, followups, activity] = await Promise.all([
    getSettings(),
    db.list<Staff>("staff"),
    db.list<Lead>("leads", all ? {} : mine),
    db.list<Package>("packages"),
    db.list<Departure>("departures"),
    db.list<Booking>("bookings", all ? {} : mine),
    db.list<Pilgrim>("pilgrims", all ? {} : mine),
    db.list<FollowUp>("followups", all ? {} : mine),
    db.list<Activity>("activity", { orderBy: "createdAt", desc: true, limit: all ? 300 : 2000 }),
  ]);
  // Seats are a fact about the departure, not about who sold them: agents get totals without the bookings.
  const seatBookings = all ? bookings : await db.list<Booking>("bookings");
  const seatsTaken: Record<string, number> = {};
  for (const b of seatBookings) {
    if (b.paymentStatus === "refunded" || b.paymentStatus === "cancelled") continue;
    seatsTaken[b.departureId] = (seatsTaken[b.departureId] ?? 0) + b.travelers;
  }
  const showEmails = can(user.role, "team.view");
  return {
    me: user,
    capabilities: capabilitiesOf(user.role),
    settings,
    staff: staff.map((s) => (showEmails ? s : { ...s, email: "", lastLoginAt: null })),
    leads,
    packages,
    departures,
    bookings,
    pilgrims,
    followups,
    seatsTaken,
    activity: (all ? activity : activity.filter((a) => a.actorId === user.id || a.visibleTo.includes(user.id))).slice(0, 300),
    server: { driver: db.kind, demoTools: env.demoTools, time: new Date().toISOString() },
  };
}

export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
