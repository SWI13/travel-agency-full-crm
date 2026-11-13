/**
 * Data model. One definition drives:
 *  - Appwrite provisioning (tables, columns, indexes) on first start,
 *  - field whitelisting and JSON (de)serialisation in the Appwrite driver,
 *  - unique constraints in the local demo driver.
 */

export type FieldType = "string" | "text" | "int" | "float" | "bool" | "datetime" | "json" | "strings";

export interface FieldDef {
  type: FieldType;
  /** Max length for `string` (default 255). */
  size?: number;
  required?: boolean;
  /** For `bool`: keep null as "not known yet" instead of reading it as false. */
  nullable?: boolean;
}

export interface IndexDef {
  fields: string[];
  unique?: boolean;
}

export interface CollectionDef {
  fields: Record<string, FieldDef>;
  indexes: IndexDef[];
}

const s = (size = 255, required = false): FieldDef => ({ type: "string", size, required });
const text: FieldDef = { type: "text" };
const int: FieldDef = { type: "int" };
const bool: FieldDef = { type: "bool" };
const triBool: FieldDef = { type: "bool", nullable: true };
const date: FieldDef = { type: "datetime" };
const json: FieldDef = { type: "json" };
const strings: FieldDef = { type: "strings" };

export const SCHEMA = {
  staff: {
    fields: {
      name: s(120, true),
      email: s(190, true),
      role: s(20, true),
      isActive: bool,
      lastLoginAt: date,
    },
    indexes: [{ fields: ["email"], unique: true }, { fields: ["role"] }],
  },
  leads: {
    fields: {
      phone: s(20),
      waUserId: s(160),
      waName: s(160),
      waUsername: s(80),
      displayName: s(160),
      serviceType: s(20, true),
      stage: s(30, true),
      priority: s(20, true),
      assignedTo: s(40),
      source: s(30, true),
      adId: s(64),
      adTitle: s(300),
      adBody: text,
      adSourceUrl: s(1000),
      adMediaType: s(20),
      ctwaClid: s(400),
      refCode: s(12),
      utmSource: s(120),
      utmCampaign: s(160),
      firstMessage: text,
      lastMessageText: text,
      lastMessageAt: date,
      lastMessageDirection: s(10),
      lastInboundAt: date,
      lastOutboundAt: date,
      firstResponseAt: date,
      lastActivityAt: date,
      unreadCount: int,
      packageId: s(40),
      departureCity: s(80),
      departureDate: s(10),
      returnDate: s(10),
      adults: int,
      children: int,
      roomPreference: s(20),
      budgetDzd: int,
      nextFollowUpAt: date,
      notes: text,
      tags: strings,
      lostReason: s(300),
      isDemo: bool,
    },
    indexes: [
      { fields: ["phone"], unique: true },
      { fields: ["waUserId"] },
      { fields: ["assignedTo"] },
      { fields: ["stage"] },
      { fields: ["lastActivityAt"] },
    ],
  },
  messages: {
    fields: {
      leadId: s(40, true),
      waMessageId: s(200, true),
      direction: s(10, true),
      type: s(30, true),
      body: text,
      timestamp: date,
      status: s(20),
      referral: json,
      isDemo: bool,
      isHistory: bool,
      processed: bool,
    },
    indexes: [{ fields: ["waMessageId"], unique: true }, { fields: ["leadId"] }, { fields: ["timestamp"] }],
  },
  packages: {
    fields: {
      name: s(160, true),
      nameAr: s(160),
      slug: s(80, true),
      refCode: s(12, true),
      category: s(10, true),
      description: text,
      descriptionAr: text,
      durationDays: int,
      departureCity: s(80),
      flightInfo: s(400),
      airline: s(80),
      directFlight: triBool,
      makkahHotel: s(200),
      makkahArea: s(80),
      haramDistanceM: int,
      walkMinutes: s(12),
      madinahHotel: s(200),
      hotelCategory: s(60),
      transport: s(300),
      roomOptions: strings,
      priceDzd: int,
      defaultCapacity: int,
      status: s(20, true),
      coverImage: s(1000),
      isDemo: bool,
    },
    indexes: [{ fields: ["slug"], unique: true }, { fields: ["refCode"], unique: true }, { fields: ["status"] }],
  },
  departures: {
    fields: {
      packageId: s(40, true),
      groupName: s(120),
      departDate: s(10, true),
      returnDate: s(10),
      departureCity: s(80),
      capacity: int,
      priceDzd: int,
      status: s(20, true),
      flightInfo: s(400),
      notes: text,
      isDemo: bool,
    },
    indexes: [{ fields: ["packageId"] }, { fields: ["departDate"] }],
  },
  bookings: {
    fields: {
      leadId: s(40, true),
      packageId: s(40, true),
      departureId: s(40, true),
      customerName: s(160, true),
      travelers: int,
      totalDzd: int,
      paidDzd: int,
      paymentStatus: s(20, true),
      bookingDate: s(10, true),
      assignedTo: s(40),
      notes: text,
      isDemo: bool,
    },
    indexes: [{ fields: ["leadId"] }, { fields: ["departureId"] }, { fields: ["assignedTo"] }],
  },
  pilgrims: {
    fields: {
      bookingId: s(40, true),
      leadId: s(40, true),
      departureId: s(40, true),
      fullName: s(160, true),
      checklist: json,
      visaStatus: s(20, true),
      notes: text,
      assignedTo: s(40),
      isDemo: bool,
    },
    indexes: [{ fields: ["bookingId"] }, { fields: ["departureId"] }, { fields: ["assignedTo"] }],
  },
  followups: {
    fields: {
      leadId: s(40, true),
      dueAt: date,
      assignedTo: s(40),
      reason: s(20, true),
      notes: text,
      status: s(10, true),
      completedAt: date,
      completedBy: s(40),
      createdBy: s(40),
      isDemo: bool,
    },
    indexes: [{ fields: ["leadId"] }, { fields: ["assignedTo"] }, { fields: ["status"] }, { fields: ["dueAt"] }],
  },
  activity: {
    fields: {
      actorId: s(40),
      actorName: s(120, true),
      actorType: s(10, true),
      action: s(40, true),
      entityType: s(30, true),
      entityId: s(40),
      leadId: s(40),
      description: s(600, true),
      meta: json,
      visibleTo: strings,
      isDemo: bool,
    },
    indexes: [{ fields: ["leadId"] }, { fields: ["action"] }, { fields: ["actorId"] }],
  },
  settings: {
    fields: {
      agencyName: s(160, true),
      agencyNameAr: s(160),
      licenseNumber: s(60),
      phone: s(30),
      whatsappNumber: s(20),
      email: s(190),
      address: s(300),
      addressAr: s(300),
      hours: s(200),
      mapsUrl: s(1000),
      facebookUrl: s(300),
      instagramUrl: s(300),
      crmLocale: s(5, true),
      soundDefault: bool,
      autoAssign: s(20, true),
      autoContacted: bool,
      assignCursor: int,
      checklistItems: json,
    },
    indexes: [],
  },
  integration: {
    fields: {
      webhookVerifiedAt: date,
      lastWebhookAt: date,
      lastWebhookOk: triBool,
      lastRealEventAt: date,
      lastDemoEventAt: date,
      lastError: s(600),
      lastErrorAt: date,
      lastTestAt: date,
      lastTestOk: triBool,
      lastTestDetail: json,
    },
    indexes: [],
  },
  webhook_events: {
    fields: {
      status: s(20, true),
      error: s(600),
      summary: s(300),
      payload: text,
      isDemo: bool,
    },
    indexes: [{ fields: ["status"] }],
  },
} satisfies Record<string, CollectionDef>;

export type Collection = keyof typeof SCHEMA;
export const COLLECTIONS = Object.keys(SCHEMA) as Collection[];
