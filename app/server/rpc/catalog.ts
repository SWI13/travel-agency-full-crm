import { z } from "zod";
import {
  DEPARTURE_STATUSES,
  PACKAGE_CATEGORIES,
  PACKAGE_STATUSES,
  PAYMENT_STATUSES,
  ROOM_TYPES,
  VISA_STATUSES,
  VOID_PAYMENT_STATUSES,
  WON_STAGES,
  type PaymentStatus,
} from "~/lib/constants";
import { leadName, slugify } from "~/lib/format";
import type { Booking, Departure, Lead, Package, Pilgrim } from "~/lib/types";
import { logActivity } from "../activity.server";
import { ROLES } from "~/lib/constants";
import { db } from "../db.server";
import { publish } from "../events.server";
import { badRequest, HttpError, notFound } from "../errors";
import { withLock } from "../leads.server";
import { assertAssigned, leadFor, rpc, zDay, zId, zMoney, zNullableText, zText } from "./core";

/** Optional text that older clients may omit entirely. */
const optText = (max: number) =>
  z.string().trim().max(max).nullable().default(null).transform((v) => v || null);

const packageInput = z.object({
  id: zId.optional(),
  name: zText(160).min(2),
  nameAr: zNullableText(160),
  category: z.enum(PACKAGE_CATEGORIES),
  description: zNullableText(5000),
  descriptionAr: zNullableText(5000),
  durationDays: z.number().int().min(1).max(120).nullable(),
  departureCity: zNullableText(80),
  flightInfo: zNullableText(400),
  airline: optText(80),
  directFlight: z.boolean().nullable().default(null),
  makkahHotel: zNullableText(200),
  makkahArea: optText(80),
  haramDistanceM: z.number().int().min(0).max(50000).nullable().default(null),
  walkMinutes: optText(12),
  madinahHotel: zNullableText(200),
  hotelCategory: zNullableText(60),
  transport: zNullableText(300),
  roomOptions: z.array(z.enum(ROOM_TYPES)).max(4),
  priceDzd: zMoney.nullable(),
  defaultCapacity: z.number().int().min(1).max(2000).nullable(),
  status: z.enum(PACKAGE_STATUSES),
  coverImage: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .refine((v) => !v || /^https:\/\/|^\/uploads\//.test(v), "Cover image must be an https:// link")
    .transform((v) => v || null),
  /** Optional first departure created together with a new package. */
  firstDeparture: z
    .object({ departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), returnDate: zDay })
    .nullable()
    .optional(),
});

const departureInput = z.object({
  id: zId.optional(),
  packageId: zId,
  groupName: zNullableText(120),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: zDay,
  departureCity: zNullableText(80),
  capacity: z.number().int().min(1).max(2000),
  priceDzd: zMoney.nullable(),
  status: z.enum(DEPARTURE_STATUSES),
  flightInfo: zNullableText(400),
  notes: zNullableText(2000),
});

async function uniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set((await db.list<Package>("packages")).filter((p) => p.id !== ignoreId).map((p) => p.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** OMR-01, OMR-02 … / HAJ-01 … — typed at the start of website WhatsApp messages. */
async function nextRefCode(category: Package["category"]): Promise<string> {
  const prefix = category === "hajj" ? "HAJ" : "OMR";
  const numbers = (await db.list<Package>("packages"))
    .map((p) => new RegExp(`^${prefix}-(\\d+)$`).exec(p.refCode)?.[1])
    .filter(Boolean)
    .map(Number);
  return `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`;
}

export function paymentStatusFor(total: number, paid: number, current?: PaymentStatus): PaymentStatus {
  if (current && VOID_PAYMENT_STATUSES.includes(current)) return current;
  if (paid <= 0) return "unpaid";
  return paid >= total ? "paid" : "partial";
}

export async function seatsLeft(departure: Departure, ignoreBookingId?: string): Promise<number> {
  const bookings = await db.list<Booking>("bookings", { where: { departureId: departure.id } });
  const taken = bookings
    .filter((b) => b.id !== ignoreBookingId && !VOID_PAYMENT_STATUSES.includes(b.paymentStatus))
    .reduce((sum, b) => sum + b.travelers, 0);
  return departure.capacity - taken;
}

/** Seat counts are visible to every employee, including agents who cannot see other people's bookings. */
async function publishSeats(departureId: string): Promise<void> {
  const departure = await db.get<Departure>("departures", departureId);
  if (!departure) return;
  const taken = departure.capacity - (await seatsLeft(departure));
  publish({ collection: "seats", op: "upsert", doc: { id: departureId, taken }, audience: { roles: [...ROLES], userIds: [] } });
}

export const catalogProcedures = {
  "packages.save": rpc({
    cap: "catalog.manage",
    input: packageInput,
    async run({ user }, input) {
      const { id, firstDeparture, ...fields } = input;
      if (id) {
        const current = await db.get<Package>("packages", id);
        if (!current) throw notFound("Package");
        const slug = current.name === fields.name ? current.slug : await uniqueSlug(fields.name, id);
        const updated = await db.update<Package>("packages", id, { ...fields, slug });
        await logActivity({
          actor: user,
          action: updated.status === "archived" && current.status !== "archived" ? "package_archived" : "package_updated",
          entityType: "package",
          entityId: id,
          description: `Package "${updated.name}" updated`,
          meta: { name: updated.name, status: updated.status },
          isDemo: updated.isDemo,
        });
        return updated;
      }
      return withLock("packages:create", async () => {
        const created = await db.create<Package>("packages", {
          ...fields,
          slug: await uniqueSlug(fields.name),
          refCode: await nextRefCode(fields.category),
          isDemo: false,
        });
        if (firstDeparture) {
          await db.create<Departure>("departures", {
            packageId: created.id,
            groupName: null,
            departDate: firstDeparture.departDate,
            returnDate: firstDeparture.returnDate,
            departureCity: created.departureCity,
            capacity: created.defaultCapacity ?? 40,
            priceDzd: null,
            status: "open",
            flightInfo: null,
            notes: null,
            isDemo: false,
          });
        }
        await logActivity({
          actor: user,
          action: "package_created",
          entityType: "package",
          entityId: created.id,
          description: `Package "${created.name}" created`,
          meta: { name: created.name, refCode: created.refCode },
        });
        return created;
      });
    },
  }),

  "packages.delete": rpc({
    cap: "catalog.manage",
    input: z.object({ id: zId }),
    async run({ user }, { id }) {
      const pkg = await db.get<Package>("packages", id);
      if (!pkg) throw notFound("Package");
      if ((await db.list<Booking>("bookings", { where: { packageId: id }, limit: 1 })).length) {
        throw new HttpError(409, "package_has_bookings", "This package has bookings. Archive it instead.");
      }
      for (const d of await db.list<Departure>("departures", { where: { packageId: id } })) await db.remove("departures", d);
      for (const lead of await db.list<Lead>("leads", { where: { packageId: id } })) {
        await db.update("leads", lead.id, { packageId: null });
      }
      await db.remove("packages", pkg);
      await logActivity({
        actor: user,
        action: "package_archived",
        entityType: "package",
        entityId: id,
        description: `Package "${pkg.name}" deleted`,
        meta: { name: pkg.name, deleted: true },
        isDemo: pkg.isDemo,
      });
      return { ok: true };
    },
  }),

  "departures.save": rpc({
    cap: "catalog.manage",
    input: departureInput,
    async run({ user }, input) {
      const { id, ...fields } = input;
      const pkg = await db.get<Package>("packages", fields.packageId);
      if (!pkg) throw notFound("Package");
      if (fields.returnDate && fields.returnDate < fields.departDate) {
        throw badRequest("The return date must be after the departure date", { field: "returnDate" });
      }
      if (id) {
        const current = await db.get<Departure>("departures", id);
        if (!current) throw notFound("Departure");
        const booked = current.capacity - (await seatsLeft(current));
        if (fields.capacity < booked) {
          throw badRequest(`Capacity cannot be lower than the ${booked} seats already booked`, { field: "capacity" });
        }
        const updated = await db.update<Departure>("departures", id, fields);
        await logActivity({
          actor: user,
          action: "departure_updated",
          entityType: "departure",
          entityId: id,
          description: `Departure of ${updated.departDate} (${pkg.name}) updated`,
          meta: { packageName: pkg.name, departDate: updated.departDate },
          isDemo: updated.isDemo,
        });
        return updated;
      }
      const created = await db.create<Departure>("departures", { ...fields, isDemo: false });
      await logActivity({
        actor: user,
        action: "departure_created",
        entityType: "departure",
        entityId: created.id,
        description: `Departure of ${created.departDate} added to ${pkg.name}`,
        meta: { packageName: pkg.name, departDate: created.departDate },
      });
      return created;
    },
  }),

  "departures.delete": rpc({
    cap: "catalog.manage",
    input: z.object({ id: zId }),
    async run(_ctx, { id }) {
      const departure = await db.get<Departure>("departures", id);
      if (!departure) throw notFound("Departure");
      if ((await db.list<Booking>("bookings", { where: { departureId: id }, limit: 1 })).length) {
        throw new HttpError(409, "departure_has_bookings", "This departure has bookings. Close or cancel it instead.");
      }
      await db.remove("departures", departure);
      return { ok: true };
    },
  }),

  // ── Bookings & pilgrims ───────────────────────────────────────────────────
  "bookings.create": rpc({
    input: z.object({
      leadId: zId,
      departureId: zId,
      travelers: z.number().int().min(1).max(100),
      totalDzd: zMoney,
      paidDzd: zMoney,
      bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: zNullableText(2000).optional(),
    }),
    async run({ user }, input) {
      const lead = await leadFor(user, input.leadId);
      if (!WON_STAGES.includes(lead.stage)) {
        throw new HttpError(409, "lead_not_confirmed", "Move the lead to Confirmed before creating a booking");
      }
      if (input.paidDzd > input.totalDzd) throw badRequest("The amount paid cannot exceed the total", { field: "paidDzd" });

      return withLock(`departure:${input.departureId}`, async () => {
        const departure = await db.get<Departure>("departures", input.departureId);
        if (!departure) throw notFound("Departure");
        if (departure.status !== "open") {
          throw new HttpError(409, "departure_closed", "This departure is not open for booking");
        }
        const left = await seatsLeft(departure);
        if (input.travelers > left) {
          throw new HttpError(409, "not_enough_seats", `Only ${left} seats left on this departure`, { left });
        }
        const pkg = await db.get<Package>("packages", departure.packageId);
        if (!pkg) throw notFound("Package");
        const customerName = leadName(lead);

        const booking = await db.create<Booking>("bookings", {
          leadId: lead.id,
          packageId: pkg.id,
          departureId: departure.id,
          customerName,
          travelers: input.travelers,
          totalDzd: input.totalDzd,
          paidDzd: input.paidDzd,
          paymentStatus: paymentStatusFor(input.totalDzd, input.paidDzd),
          bookingDate: input.bookingDate,
          assignedTo: lead.assignedTo ?? user.id,
          notes: input.notes ?? null,
          isDemo: lead.isDemo,
        });
        for (let i = 0; i < input.travelers; i++) {
          await db.create<Pilgrim>("pilgrims", {
            bookingId: booking.id,
            leadId: lead.id,
            departureId: departure.id,
            fullName: i === 0 ? customerName : `${customerName} +${i}`,
            checklist: {},
            visaStatus: "not_started",
            notes: null,
            assignedTo: booking.assignedTo,
            isDemo: lead.isDemo,
          });
        }
        await publishSeats(departure.id);
        if (!lead.packageId) await db.update("leads", lead.id, { packageId: pkg.id });
        await logActivity({
          actor: user,
          action: "booking_created",
          entityType: "booking",
          entityId: booking.id,
          lead,
          description: `Booking created: ${pkg.name}, ${input.travelers} traveller(s)`,
          meta: { packageName: pkg.name, travelers: input.travelers, totalDzd: input.totalDzd, paidDzd: input.paidDzd },
        });
        return booking;
      });
    },
  }),

  "bookings.update": rpc({
    input: z.object({
      id: zId,
      totalDzd: zMoney.optional(),
      paidDzd: zMoney.optional(),
      paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
      notes: zNullableText(2000).optional(),
    }),
    async run({ user }, input) {
      const booking = await db.get<Booking>("bookings", input.id);
      if (!booking) throw notFound("Booking");
      assertAssigned(user, booking.assignedTo);
      const total = input.totalDzd ?? booking.totalDzd;
      const paid = input.paidDzd ?? booking.paidDzd;
      if (paid > total) throw badRequest("The amount paid cannot exceed the total", { field: "paidDzd" });

      // Refunded / cancelled are explicit decisions; the other states follow the amounts.
      const explicit = input.paymentStatus;
      const paymentStatus =
        explicit && VOID_PAYMENT_STATUSES.includes(explicit)
          ? explicit
          : paymentStatusFor(total, paid, explicit ? undefined : booking.paymentStatus);
      const patch: Record<string, unknown> = { totalDzd: total, paidDzd: paid, paymentStatus };
      if (input.notes !== undefined) patch.notes = input.notes;

      const updated = await db.update<Booking>("bookings", input.id, patch);
      await publishSeats(booking.departureId);
      const lead = await db.get<Lead>("leads", booking.leadId);
      const paymentChanged = paid !== booking.paidDzd || paymentStatus !== booking.paymentStatus || total !== booking.totalDzd;
      await logActivity({
        actor: user,
        action: paymentChanged ? "payment_updated" : "booking_updated",
        entityType: "booking",
        entityId: updated.id,
        lead,
        description: paymentChanged
          ? `Payment updated: ${paid} / ${total} DZD (${paymentStatus})`
          : "Booking notes updated",
        meta: { paidDzd: paid, totalDzd: total, paymentStatus, previousStatus: booking.paymentStatus, previousPaid: booking.paidDzd },
        isDemo: booking.isDemo,
      });
      return updated;
    },
  }),

  "pilgrims.update": rpc({
    input: z.object({
      id: zId,
      fullName: zText(160).min(1).optional(),
      checklist: z.record(z.string().max(40), z.boolean()).optional(),
      visaStatus: z.enum(VISA_STATUSES).optional(),
      notes: zNullableText(1000).optional(),
    }),
    async run({ user }, { id, ...patch }) {
      const pilgrim = await db.get<Pilgrim>("pilgrims", id);
      if (!pilgrim) throw notFound("Pilgrim");
      assertAssigned(user, pilgrim.assignedTo);
      return db.update<Pilgrim>("pilgrims", id, patch);
    },
  }),
};

