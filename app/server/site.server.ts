import { VOID_PAYMENT_STATUSES } from "~/lib/constants";
import type { Booking, Departure, Package, PublicPackage, Settings } from "~/lib/types";
import { db } from "./db.server";
import { getSettings } from "./session.server";

/** Agency details shown to visitors. Only fields meant to be public. */
export type PublicSite = Pick<
  Settings,
  | "agencyName"
  | "agencyNameAr"
  | "licenseNumber"
  | "phone"
  | "whatsappNumber"
  | "email"
  | "address"
  | "addressAr"
  | "hours"
  | "mapsUrl"
  | "facebookUrl"
  | "instagramUrl"
>;

export async function publicSite(): Promise<PublicSite> {
  const s = await getSettings();
  return {
    agencyName: s.agencyName,
    agencyNameAr: s.agencyNameAr,
    licenseNumber: s.licenseNumber,
    phone: s.phone,
    whatsappNumber: s.whatsappNumber,
    email: s.email,
    address: s.address,
    addressAr: s.addressAr,
    hours: s.hours,
    mapsUrl: s.mapsUrl,
    facebookUrl: s.facebookUrl,
    instagramUrl: s.instagramUrl,
  };
}

/**
 * Packages visitors may see: status "active" only, with their open, future
 * departures and the seats actually left. Internal fields never leave the server.
 */
export async function publicPackages(): Promise<PublicPackage[]> {
  const [packages, departures, bookings] = await Promise.all([
    db.list<Package>("packages", { where: { status: "active" } }),
    db.list<Departure>("departures", { where: { status: "open" }, orderBy: "departDate" }),
    db.list<Booking>("bookings"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const taken = new Map<string, number>();
  for (const b of bookings) {
    if (VOID_PAYMENT_STATUSES.includes(b.paymentStatus)) continue;
    taken.set(b.departureId, (taken.get(b.departureId) ?? 0) + b.travelers);
  }

  return packages
    .map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      slug: p.slug,
      refCode: p.refCode,
      category: p.category,
      description: p.description,
      descriptionAr: p.descriptionAr,
      durationDays: p.durationDays,
      departureCity: p.departureCity,
      flightInfo: p.flightInfo,
      airline: p.airline ?? null,
      directFlight: p.directFlight ?? null,
      makkahHotel: p.makkahHotel,
      makkahArea: p.makkahArea ?? null,
      haramDistanceM: p.haramDistanceM ?? null,
      walkMinutes: p.walkMinutes ?? null,
      madinahHotel: p.madinahHotel,
      hotelCategory: p.hotelCategory,
      transport: p.transport,
      roomOptions: p.roomOptions,
      priceDzd: p.priceDzd,
      coverImage: p.coverImage,
      isDemo: p.isDemo,
      departures: departures
        .filter((d) => d.packageId === p.id && d.departDate >= today)
        .map((d) => ({
          id: d.id,
          departDate: d.departDate,
          returnDate: d.returnDate,
          departureCity: d.departureCity,
          priceDzd: d.priceDzd,
          capacity: d.capacity,
          seatsLeft: Math.max(0, d.capacity - (taken.get(d.id) ?? 0)),
        })),
    }))
    .sort((a, b) => (a.departures[0]?.departDate ?? "9999").localeCompare(b.departures[0]?.departDate ?? "9999"));
}

export async function publicPackageBySlug(slug: string): Promise<PublicPackage | null> {
  return (await publicPackages()).find((p) => p.slug === slug) ?? null;
}
