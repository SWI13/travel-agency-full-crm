import { z } from "zod";
import { VOID_PAYMENT_STATUSES } from "~/lib/constants";
import { dayKey } from "~/lib/format";
import type { Booking, Departure, Lead, Package } from "~/lib/types";
import { logActivity } from "../activity.server";
import { db } from "../db.server";
import { HttpError, notFound } from "../errors";
import { catalogProcedures } from "./catalog";
import { leadFor, rpc, zId, zMoney } from "./core";

/**
 * "Assign to trip": the one step between a WhatsApp customer and a trip.
 *
 * - Not confirmed: the customer is linked to the trip (visible in the trip's customer list).
 *   No booking is created and no seat is taken.
 * - Confirmed: the normal booking is created (seats are deducted, pilgrims are prepared).
 *   Payments, documents and visas are handled later in Bookings.
 */
export const assignProcedures = {
  "leads.assignTrip": rpc({
    input: z.object({
      leadId: zId,
      departureId: zId,
      travelers: z.number().int().min(1).max(100),
      confirmed: z.boolean().default(false),
      totalDzd: zMoney.optional(),
      paidDzd: zMoney.optional(),
    }),
    async run(ctx, input) {
      const { user } = ctx;
      const lead = await leadFor(user, input.leadId);
      const departure = await db.get<Departure>("departures", input.departureId);
      if (!departure) throw notFound("Departure");
      if (departure.status !== "open" || departure.departDate < dayKey(new Date())) throw new HttpError(409, "departure_closed", "This departure is not open for booking");
      const pkg = await db.get<Package>("packages", departure.packageId);
      if (!pkg) throw notFound("Package");

      const bookings = await db.list<Booking>("bookings", { where: { leadId: lead.id } });
      if (bookings.some((b) => b.departureId === departure.id && !VOID_PAYMENT_STATUSES.includes(b.paymentStatus))) {
        throw new HttpError(409, "already_booked", "This customer already has a booking on this departure");
      }

      if (input.confirmed) {
        const unit = departure.priceDzd ?? pkg.priceDzd ?? 0;
        const booking = (await catalogProcedures["bookings.create"].run(ctx, {
          leadId: lead.id,
          departureId: departure.id,
          travelers: input.travelers,
          totalDzd: input.totalDzd ?? unit * input.travelers,
          paidDzd: input.paidDzd ?? 0,
          bookingDate: dayKey(new Date()),
          notes: null,
          confirmLead: true,
        })) as Booking;
        const updated = await db.update<Lead>("leads", lead.id, {
          departureId: departure.id,
          tripTravelers: input.travelers,
          assignedTo: lead.assignedTo ?? user.id,
        });
        return { lead: updated, booking };
      }

      const now = new Date().toISOString();
      const earlyStage = ["new", "contacted", "qualified"].includes(lead.stage);
      const updated = await db.update<Lead>("leads", lead.id, {
        packageId: pkg.id,
        departureId: departure.id,
        tripTravelers: input.travelers,
        assignedTo: lead.assignedTo ?? user.id,
        ...(earlyStage ? { stage: "package_sent" } : {}),
        lastActivityAt: now,
      });
      await logActivity({
        actor: user,
        action: "package_selected",
        entityType: "lead",
        lead: updated,
        description: `Assigned to trip: ${pkg.name} (${departure.departDate}), ${input.travelers} traveller(s)`,
        meta: { packageName: pkg.name, departDate: departure.departDate, travelers: input.travelers },
      });
      return { lead: updated, booking: null };
    },
  }),

  /** Removes an unconfirmed assignment (a mistake, or the customer changed their mind). */
  "leads.clearTrip": rpc({
    input: z.object({ leadId: zId }),
    async run({ user }, input) {
      const lead = await leadFor(user, input.leadId);
      if (!lead.departureId) return lead;
      const bookings = await db.list<Booking>("bookings", { where: { leadId: lead.id } });
      if (bookings.some((b) => b.departureId === lead.departureId && !VOID_PAYMENT_STATUSES.includes(b.paymentStatus))) {
        throw new HttpError(409, "already_booked", "This customer already has a booking on this departure");
      }
      const updated = await db.update<Lead>("leads", lead.id, { departureId: null, tripTravelers: null, lastActivityAt: new Date().toISOString() });
      await logActivity({
        actor: user,
        action: "lead_updated",
        entityType: "lead",
        lead: updated,
        description: "Trip assignment removed",
        meta: { fields: ["departureId"] },
      });
      return updated;
    },
  }),
};
