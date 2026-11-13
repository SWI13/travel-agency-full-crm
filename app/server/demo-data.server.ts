import { randomBytes } from "node:crypto";
import type { LeadSource, LeadStage, ServiceType } from "~/lib/constants";
import type { Booking, Departure, FollowUp, Lead, Package, Staff } from "~/lib/types";
import { db } from "./db.server";
import { blankLead, leadIdForPhone, messageIdFor } from "./leads.server";
import { paymentStatusFor } from "./rpc/catalog";
import { ConflictError, getStore } from "./store/index.server";
import { COLLECTIONS } from "./store/schema";

/**
 * Sample records for demonstrations. Everything is flagged `isDemo: true`
 * (employees use the reserved @demo.invalid domain) and can be removed in one click.
 * Hotel names, prices and dates below are invented placeholders, not real offers.
 */

const DEMO_DOMAIN = "@demo.invalid";
const day = 86_400_000;
const iso = (offsetDays: number, hour = 10) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(hour, (Math.abs(offsetDays) * 13) % 60, 0, 0);
  return d.toISOString();
};
const ymd = (offsetDays: number) => iso(offsetDays).slice(0, 10);

/** Any sample record at all (seeded set or simulated webhook events). */
export async function hasDemoData(): Promise<boolean> {
  const [lead] = await db.list<Lead>("leads", { where: { isDemo: true }, limit: 1 });
  const [pkg] = await db.list<Package>("packages", { where: { isDemo: true }, limit: 1 });
  return Boolean(lead || pkg);
}

/** The seeded sample set specifically, so simulated events never block loading it. */
export async function demoSeedLoaded(): Promise<boolean> {
  return (await db.list<Package>("packages", { where: { slug: "demo-omra-confort" }, limit: 1 })).length > 0;
}

async function demoStaff(name: string, email: string, role: Staff["role"]): Promise<Staff> {
  const [existing] = await db.list<Staff>("staff", { where: { email }, limit: 1 });
  if (existing) return existing;
  // Random password nobody knows: an administrator sets a real one from the Team page if needed.
  const auth = getStore().auth;
  let id: string;
  try {
    id = await auth.createUser(email, randomBytes(24).toString("base64url"), name);
  } catch (error) {
    // Logins are shared by every database of the project: reuse a sample login left by an earlier load.
    const existingId = error instanceof ConflictError ? await auth.findUserIdByEmail(email) : null;
    if (!existingId) throw error;
    id = existingId;
  }
  return db.create<Staff>("staff", { name, email, role, isActive: true, lastLoginAt: null }, { id });
}

interface DemoLead {
  n: number;
  name: string | null;
  stage: LeadStage;
  source: LeadSource;
  service: ServiceType;
  ageDays: number;
  agent: 0 | 1 | null;
  text: string;
  reply?: string;
  unread?: number;
  priority?: Lead["priority"];
  ad?: string;
  pkg?: number;
  lostReason?: string;
}

const LEADS: DemoLead[] = [
  { n: 1, name: "Karim Benali", stage: "new", source: "facebook_ad", service: "umrah", ageDays: 0, agent: null, text: "السلام عليكم، شفت الإعلان تاع عمرة رمضان، كم السعر؟", unread: 1, ad: "Omra Ramadan — départ Alger", priority: "high" },
  { n: 2, name: "Amina Hadj Ali", stage: "new", source: "organic", service: "unknown", ageDays: 0, agent: null, text: "Bonjour, vous avez des offres pour la fin d'année ?", unread: 2 },
  { n: 3, name: null, stage: "new", source: "instagram_ad", service: "umrah", ageDays: 1, agent: 0, text: "سلام، نحب نعرف برنامج العمرة", unread: 1, ad: "عمرة شعبان — أماكن محدودة" },
  { n: 4, name: "Yacine Meziane", stage: "contacted", source: "website_whatsapp", service: "umrah", ageDays: 2, agent: 0, text: "[OMR-91] السلام عليكم، أريد معلومات عن هذا العرض", reply: "وعليكم السلام، مرحبا. العرض يشمل الطيران والفندق والتأشيرة.", pkg: 0 },
  { n: 5, name: "Fatima Zohra B.", stage: "contacted", source: "facebook_ad", service: "hajj", ageDays: 3, agent: 1, text: "كيفاش التسجيل في الحج هذا العام؟", reply: "مرحبا، سنشرح لك الإجراءات.", ad: "Hajj 2027 — inscriptions ouvertes" },
  { n: 6, name: "Mohamed Cherif", stage: "qualified", source: "organic", service: "umrah", ageDays: 5, agent: 0, text: "Salam, Omra pour 4 personnes en mars, vous avez de la place ?", reply: "Oui, il reste des places sur le départ de mars.", priority: "high", pkg: 0 },
  { n: 7, name: "Nadia Belkacem", stage: "package_sent", source: "instagram_ad", service: "umrah", ageDays: 6, agent: 1, text: "ممكن ترسلولي تفاصيل البرنامج الاقتصادي؟", reply: "تم إرسال البرنامج، في انتظار ردك.", ad: "عمرة شعبان — أماكن محدودة", pkg: 1 },
  { n: 8, name: "Abdelkader S.", stage: "awaiting_documents", source: "website_form", service: "umrah", ageDays: 8, agent: 0, text: "Demande via le site : Omra pour 2 adultes.", reply: "Merci, il nous faut les passeports.", pkg: 0 },
  { n: 9, name: "Samira Touati", stage: "awaiting_deposit", source: "facebook_ad", service: "umrah", ageDays: 10, agent: 1, text: "واش لازم ندفع العربون قبل؟", reply: "نعم، العربون يؤكد الحجز.", priority: "urgent", ad: "Omra Ramadan — départ Alger", pkg: 1 },
  { n: 10, name: "Rachid Bouzid", stage: "confirmed", source: "organic", service: "umrah", ageDays: 14, agent: 0, text: "Je confirme pour 3 personnes.", reply: "Parfait, réservation enregistrée.", pkg: 0 },
  { n: 11, name: "Khadidja Mansouri", stage: "travel_preparation", source: "manual", service: "hajj", ageDays: 20, agent: 1, text: "Passage à l'agence — dossier Hajj.", pkg: 2 },
  { n: 12, name: "Omar Ferhat", stage: "completed", source: "facebook_ad", service: "umrah", ageDays: 40, agent: 0, text: "بارك الله فيكم على التنظيم", ad: "Omra Ramadan — départ Alger", pkg: 1 },
  { n: 13, name: "Lina K.", stage: "lost", source: "instagram_ad", service: "umrah", ageDays: 12, agent: 1, text: "Merci, c'est trop cher pour nous.", ad: "عمرة شعبان — أماكن محدودة", lostReason: "Trop cher" },
  { n: 14, name: "Sofiane D.", stage: "lost", source: "organic", service: "unknown", ageDays: 18, agent: 0, text: "On a réservé ailleurs, merci.", lostReason: "A réservé ailleurs" },
  { n: 15, name: "Imane Rahmani", stage: "new", source: "instagram_ad", service: "unknown", ageDays: 0, agent: null, text: "Bonsoir ! Istanbul et la Cappadoce, c'est combien pour une famille de 4 ?", unread: 1, ad: "Istanbul & Cappadoce — été 2027", priority: "high" },
  { n: 16, name: "Hichem Larbi", stage: "package_sent", source: "organic", service: "unknown", ageDays: 4, agent: 1, text: "سلام، رحلة جانت فيها بلاصة لثلاثة؟", reply: "مرحبا، نعم. أرسلنا لك البرنامج والسعر.", pkg: 4 },
  { n: 17, name: "Meriem Aouadi", stage: "confirmed", source: "website_whatsapp", service: "unknown", ageDays: 9, agent: 0, text: "[VAC-91] Bonjour, on confirme pour 4 personnes en juillet.", reply: "Merci ! Votre réservation est enregistrée.", pkg: 3 },
];

export async function loadDemoData(): Promise<{ leads: number; packages: number }> {
  if (await demoSeedLoaded()) return { leads: 0, packages: 0 };

  const agents = [
    await demoStaff("Sara (démo)", `agent.sara${DEMO_DOMAIN}`, "agent"),
    await demoStaff("Walid (démo)", `agent.walid${DEMO_DOMAIN}`, "agent"),
  ];
  await demoStaff("Responsable (démo)", `manager${DEMO_DOMAIN}`, "manager");

  // ── Packages & departures ────────────────────────────────────────────────
  const base = {
    descriptionAr: null, isDemo: true, status: "active",
    roomOptions: ["double", "triple", "quad"], departureCity: "Alger",
  };
  const packages: Package[] = [];
  const pkgDefs = [
    { name: "Omra Confort 15 jours", nameAr: "عمرة مريحة 15 يوم", slug: "demo-omra-confort", refCode: "OMR-91", category: "umrah", coverImage: "/demo/umrah.jpg", durationDays: 15, priceDzd: 199000, airline: "Vol direct Alger – Djeddah", directFlight: true, makkahArea: "Ajyad", haramDistanceM: 700, walkMinutes: "10-12", defaultCapacity: 45, hotelCategory: "4★", makkahHotel: "Hôtel 4★ à 700 m du Haram", madinahHotel: "Hôtel 4★ près de la mosquée du Prophète", flightInfo: "Vol direct, bagages inclus", transport: "Bus climatisé", description: "Offre d'exemple pour la démonstration : vol direct, visa, hôtels proches et accompagnement de la vente au retour." },
    { name: "Omra Économique 15 jours", nameAr: "عمرة اقتصادية 15 يوم", slug: "demo-omra-eco", refCode: "OMR-92", category: "umrah", coverImage: "/demo/umrah.jpg", durationDays: 15, priceDzd: 159000, airline: "Vol avec escale", directFlight: false, makkahArea: "Aziziya", haramDistanceM: 1200, walkMinutes: "15-20", defaultCapacity: 50, hotelCategory: "3★", makkahHotel: "Hôtel 3★ avec navette vers le Haram", madinahHotel: "Hôtel 3★ à Médine", flightInfo: "Vol avec escale", transport: "Bus", description: "Offre d'exemple au meilleur prix, pour la démonstration." },
    { name: "Hajj 2027", nameAr: "حج 2027", slug: "demo-hajj", refCode: "HAJ-91", category: "hajj", coverImage: "/demo/umrah.jpg", durationDays: 25, priceDzd: 890000, airline: "Vol direct", directFlight: true, makkahArea: null, haramDistanceM: null, walkMinutes: null, defaultCapacity: 30, hotelCategory: "4★", makkahHotel: "Hôtel 4★ à La Mecque", madinahHotel: "Hôtel 4★ à Médine", flightInfo: "Vol direct", transport: "Bus climatisé", description: "Offre Hajj d'exemple pour la démonstration." },
    { name: "Istanbul & Cappadoce 8 jours", nameAr: "إسطنبول وكبادوكيا 8 أيام", slug: "demo-turkey", refCode: "VAC-91", category: "vacation", coverImage: "/demo/turkey.jpg", durationDays: 8, priceDzd: 145000, airline: "Vol direct Alger – Istanbul", directFlight: true, makkahArea: null, haramDistanceM: null, walkMinutes: null, madinahHotel: null, defaultCapacity: 35, hotelCategory: "4★", makkahHotel: "Hôtel 4★ au centre d'Istanbul + hôtel troglodyte en Cappadoce", flightInfo: "Vol direct, bagages inclus", transport: "Transferts et excursions en bus", description: "Exemple de vacances : Sainte-Sophie, le Bosphore, la Cappadoce et son vol en montgolfière (en option)." },
    { name: "Djanet & Tassili 6 jours", nameAr: "جانت والطاسيلي 6 أيام", slug: "demo-tassili", refCode: "TRP-91", category: "trip", coverImage: "/demo/algeria.jpg", durationDays: 6, priceDzd: 89000, airline: "Vol Alger – Djanet", directFlight: true, makkahArea: null, haramDistanceM: null, walkMinutes: null, madinahHotel: null, defaultCapacity: 20, hotelCategory: null, makkahHotel: "Maison d'hôtes et bivouac dans le désert", flightInfo: "Vol intérieur aller-retour", transport: "4x4 avec guide local", description: "Exemple de circuit en Algérie : l'Erg Admer, les gravures du Tassili et une nuit sous les étoiles." },
  ];
  for (const def of pkgDefs) packages.push(await db.create<Package>("packages", { ...base, ...def }));

  const departures: Departure[] = [];
  const depDefs = [
    { pkg: 0, in: 18, cap: 45 }, { pkg: 0, in: 52, cap: 45 }, { pkg: 1, in: 9, cap: 50 },
    { pkg: 1, in: 75, cap: 50 }, { pkg: 2, in: 160, cap: 30 }, { pkg: 1, in: -35, cap: 50, status: "departed" },
    { pkg: 3, in: 34, cap: 35 }, { pkg: 3, in: 96, cap: 35 }, { pkg: 4, in: 21, cap: 20 },
  ];
  for (const d of depDefs) {
    const pkg = packages[d.pkg];
    departures.push(
      await db.create<Departure>("departures", {
        packageId: pkg.id, groupName: `Groupe ${ymd(d.in)}`, departDate: ymd(d.in),
        returnDate: ymd(d.in + (pkg.durationDays ?? 10)), departureCity: "Alger", capacity: d.cap,
        priceDzd: null, status: d.status ?? "open", flightInfo: null, notes: null, isDemo: true,
      }),
    );
  }

  // ── Leads & conversations ────────────────────────────────────────────────
  const leads: Lead[] = [];
  for (const d of LEADS) {
    const phone = `+2135550091${String(d.n).padStart(2, "0")}`;
    // Today's sample leads are placed in the recent past, never in the future.
    const createdAt = d.ageDays === 0 ? new Date(Date.now() - d.n * 41 * 60_000).toISOString() : iso(-d.ageDays, 9 + (d.n % 8));
    const replyAt = d.reply ? new Date(new Date(createdAt).getTime() + (5 + d.n * 3) * 60_000).toISOString() : null;
    const assignedTo = d.agent === null ? null : agents[d.agent].id;
    const manual = d.source === "manual" || d.source === "website_form";
    const lead = await db.create<Lead>(
      "leads",
      {
        ...blankLead(replyAt ?? createdAt),
        createdAt,
        phone,
        waName: manual ? null : d.name,
        displayName: manual ? d.name : null,
        stage: d.stage,
        source: d.source,
        serviceType: d.service,
        priority: d.priority ?? "normal",
        assignedTo,
        adTitle: d.ad ?? null,
        adId: d.ad ? `DEMO${1000 + d.n}` : null,
        adSourceUrl: d.ad ? (d.source === "instagram_ad" ? "https://www.instagram.com/p/demo/" : "https://fb.me/demo") : null,
        refCode: d.source === "website_whatsapp" && d.pkg !== undefined ? packages[d.pkg].refCode : null,
        packageId: d.pkg !== undefined ? packages[d.pkg].id : null,
        firstMessage: d.text,
        lastMessageText: d.reply ?? d.text,
        lastMessageAt: replyAt ?? createdAt,
        lastMessageDirection: d.reply ? "outbound" : "inbound",
        lastInboundAt: createdAt,
        lastOutboundAt: replyAt,
        firstResponseAt: replyAt,
        unreadCount: d.unread ?? 0,
        adults: d.pkg !== undefined ? (d.n === 17 ? 4 : 2) : null,
        lostReason: d.lostReason ?? null,
        tags: ["demo"],
        isDemo: true,
      },
      { id: leadIdForPhone(phone) },
    );
    leads.push(lead);

    const messages: Array<[string, "inbound" | "outbound", string]> = [[d.text, "inbound", createdAt]];
    if (d.reply && replyAt) messages.push([d.reply, "outbound", replyAt]);
    for (const [i, [body, direction, timestamp]] of messages.entries()) {
      const waMessageId = `wamid.DEMOSEED${d.n}_${i}`;
      await db.create(
        "messages",
        {
          leadId: lead.id, waMessageId, direction, type: d.source === "website_form" && i === 0 ? "website_form" : "text",
          body, timestamp, status: direction === "outbound" ? "read" : null, referral: null,
          isDemo: true, isHistory: false, processed: true,
        },
        { id: messageIdFor(waMessageId), silent: true },
      );
    }
    await db.create(
      "activity",
      {
        createdAt, actorId: null, actorName: "System", actorType: "system", action: "lead_created",
        entityType: "lead", entityId: lead.id, leadId: lead.id, description: `New lead ${d.name ?? phone}`,
        meta: { source: d.source, name: d.name }, visibleTo: assignedTo ? [assignedTo] : [], isDemo: true,
      },
      { silent: true },
    );
  }

  // ── Follow-ups ───────────────────────────────────────────────────────────
  const followDefs: Array<[number, number, number, FollowUp["reason"], boolean]> = [
    [3, -2, 11, "call_back", false], [5, -1, 15, "send_offer", false], [6, 0, 14, "send_offer", false],
    [7, 0, 17, "call_back", false], [8, 1, 10, "documents", false], [9, 2, 11, "deposit", false],
    [4, -3, 10, "call_back", true], [16, 1, 15, "call_back", false],
  ];
  for (const [n, offset, hour, reason, done] of followDefs) {
    const lead = leads[n - 1];
    const dueAt = iso(offset, hour);
    await db.create("followups", {
      leadId: lead.id, dueAt, assignedTo: lead.assignedTo, reason, notes: null,
      status: done ? "done" : "pending", completedAt: done ? iso(offset, hour + 1) : null,
      completedBy: done ? lead.assignedTo : null, createdBy: null, isDemo: true,
    });
    if (!done) await db.update("leads", lead.id, { nextFollowUpAt: dueAt }, { silent: true });
  }

  // ── Bookings & pilgrims ──────────────────────────────────────────────────
  const bookingDefs = [
    { lead: 10, dep: 0, travelers: 3, paid: 300000, ago: 6 },
    { lead: 11, dep: 4, travelers: 2, paid: 1780000, ago: 12 },
    { lead: 12, dep: 5, travelers: 2, paid: 396000, ago: 38 },
    { lead: 17, dep: 6, travelers: 4, paid: 200000, ago: 8 },
  ];
  for (const b of bookingDefs) {
    const lead = leads[b.lead - 1];
    const departure = departures[b.dep];
    const pkg = packages.find((p) => p.id === departure.packageId)!;
    const total = (pkg.priceDzd ?? 0) * b.travelers;
    const name = lead.displayName ?? lead.waName ?? lead.phone!;
    const booking = await db.create<Booking>("bookings", {
      createdAt: iso(-b.ago), leadId: lead.id, packageId: pkg.id, departureId: departure.id, customerName: name,
      travelers: b.travelers, totalDzd: total, paidDzd: b.paid, paymentStatus: paymentStatusFor(total, b.paid),
      bookingDate: ymd(-b.ago), assignedTo: lead.assignedTo, notes: null, isDemo: true,
    });
    for (let i = 0; i < b.travelers; i++) {
      await db.create("pilgrims", {
        bookingId: booking.id, leadId: lead.id, departureId: departure.id,
        fullName: i === 0 ? name : `${name} +${i}`,
        checklist: i === 0 ? { passport: true, photos: true, documents: b.ago > 10 } : { passport: b.ago > 10 },
        visaStatus: b.ago > 30 ? "approved" : i === 0 ? "in_progress" : "not_started",
        notes: null, assignedTo: lead.assignedTo, isDemo: true,
      });
    }
  }
  return { leads: leads.length, packages: packages.length };
}

/** Removes every sample record (and the demo employees). Real data is untouched. */
export async function clearDemoData(): Promise<number> {
  const store = getStore();
  let removed = 0;
  for (const collection of COLLECTIONS) {
    if (collection === "staff" || collection === "settings" || collection === "integration") continue;
    const rows = await store.list<{ id: string }>(collection, { where: { isDemo: true } });
    for (const row of rows) {
      await db.remove(collection, row);
      removed += 1;
    }
  }
  for (const staff of await db.list<Staff>("staff")) {
    if (!staff.email.endsWith(DEMO_DOMAIN)) continue;
    await store.auth.removeUser(staff.id).catch(() => {});
    await db.remove("staff", staff);
    removed += 1;
  }
  return removed;
}
