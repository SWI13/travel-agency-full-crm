import type {
  ActivityAction,
  DepartureStatus,
  FollowUpReason,
  LeadSource,
  LeadStage,
  Locale,
  PackageCategory,
  PackageStatus,
  PaymentStatus,
  Priority,
  Role,
  ServiceType,
  VisaStatus,
} from "./constants";

export interface BaseDoc {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Staff extends BaseDoc {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface Lead extends BaseDoc {
  /** E.164 phone, e.g. +213661234567. Null when Meta only supplied a business-scoped user ID. */
  phone: string | null;
  /** Meta business-scoped user ID (BSUID), when supplied. */
  waUserId: string | null;
  waName: string | null;
  waUsername: string | null;
  /** Name typed by an employee. Never overwritten by webhooks. */
  displayName: string | null;
  serviceType: ServiceType;
  stage: LeadStage;
  priority: Priority;
  assignedTo: string | null;

  source: LeadSource;
  adId: string | null;
  adTitle: string | null;
  adBody: string | null;
  adSourceUrl: string | null;
  adMediaType: string | null;
  ctwaClid: string | null;
  refCode: string | null;
  utmSource: string | null;
  utmCampaign: string | null;

  firstMessage: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  firstResponseAt: string | null;
  lastActivityAt: string;
  unreadCount: number;

  packageId: string | null;
  departureCity: string | null;
  departureDate: string | null;
  returnDate: string | null;
  adults: number | null;
  children: number | null;
  roomPreference: string | null;
  budgetDzd: number | null;

  nextFollowUpAt: string | null;
  notes: string | null;
  tags: string[];
  lostReason: string | null;
  isDemo: boolean;
}

export interface Referral {
  sourceType: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  mediaType: string | null;
  ctwaClid: string | null;
}

export interface Message extends BaseDoc {
  leadId: string;
  waMessageId: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string;
  timestamp: string;
  status: string | null;
  referral: Referral | null;
  isDemo: boolean;
  isHistory: boolean;
  /** False until the lead record has been updated for this message (retry safety). */
  processed: boolean;
}

export interface Package extends BaseDoc {
  name: string;
  nameAr: string | null;
  slug: string;
  refCode: string;
  category: PackageCategory;
  description: string | null;
  descriptionAr: string | null;
  durationDays: number | null;
  departureCity: string | null;
  flightInfo: string | null;
  airline: string | null;
  /** true = direct, false = with a stopover, null = not specified. */
  directFlight: boolean | null;
  makkahHotel: string | null;
  makkahArea: string | null;
  /** Walking distance from the Makkah hotel to the Haram, in metres. */
  haramDistanceM: number | null;
  /** Walking time to the Haram as typed by the agency, e.g. "10-12" (minutes). */
  walkMinutes: string | null;
  madinahHotel: string | null;
  hotelCategory: string | null;
  transport: string | null;
  roomOptions: string[];
  priceDzd: number | null;
  defaultCapacity: number | null;
  status: PackageStatus;
  coverImage: string | null;
  isDemo: boolean;
}

export interface Departure extends BaseDoc {
  packageId: string;
  groupName: string | null;
  departDate: string;
  returnDate: string | null;
  departureCity: string | null;
  capacity: number;
  /** Overrides the package price when set. */
  priceDzd: number | null;
  status: DepartureStatus;
  flightInfo: string | null;
  notes: string | null;
  isDemo: boolean;
}

export interface Booking extends BaseDoc {
  leadId: string;
  packageId: string;
  departureId: string;
  customerName: string;
  travelers: number;
  totalDzd: number;
  paidDzd: number;
  paymentStatus: PaymentStatus;
  bookingDate: string;
  assignedTo: string | null;
  notes: string | null;
  isDemo: boolean;
}

export interface Pilgrim extends BaseDoc {
  bookingId: string;
  leadId: string;
  departureId: string;
  fullName: string;
  checklist: Record<string, boolean>;
  visaStatus: VisaStatus;
  notes: string | null;
  assignedTo: string | null;
  isDemo: boolean;
}

export interface FollowUp extends BaseDoc {
  leadId: string;
  dueAt: string;
  assignedTo: string | null;
  reason: FollowUpReason;
  notes: string | null;
  status: "pending" | "done";
  completedAt: string | null;
  completedBy: string | null;
  createdBy: string | null;
  isDemo: boolean;
}

export interface Activity extends BaseDoc {
  actorId: string | null;
  actorName: string;
  actorType: "user" | "system";
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  leadId: string | null;
  description: string;
  meta: Record<string, unknown>;
  /** Agents allowed to see this entry (admins and managers see everything). */
  visibleTo: string[];
  isDemo: boolean;
}

export interface ChecklistItem {
  key: string;
  label: string;
}

export interface Settings extends BaseDoc {
  agencyName: string;
  agencyNameAr: string | null;
  licenseNumber: string | null;
  phone: string | null;
  /** Digits only, international format, used for wa.me links on the website. */
  whatsappNumber: string | null;
  email: string | null;
  address: string | null;
  addressAr: string | null;
  hours: string | null;
  mapsUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  crmLocale: Locale;
  soundDefault: boolean;
  autoAssign: "off" | "round_robin";
  autoContacted: boolean;
  assignCursor: number;
  checklistItems: ChecklistItem[];
}

export interface IntegrationState extends BaseDoc {
  webhookVerifiedAt: string | null;
  lastWebhookAt: string | null;
  lastWebhookOk: boolean | null;
  lastRealEventAt: string | null;
  lastDemoEventAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestDetail: Record<string, unknown> | null;
}

export interface WebhookEvent extends BaseDoc {
  status: "received" | "processed" | "failed" | "ignored";
  error: string | null;
  summary: string | null;
  payload: string;
  isDemo: boolean;
}

/** Public, non-sensitive subset used by the visitor website. */
export interface PublicPackage {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  refCode: string;
  category: PackageCategory;
  description: string | null;
  descriptionAr: string | null;
  durationDays: number | null;
  departureCity: string | null;
  flightInfo: string | null;
  airline: string | null;
  /** true = direct, false = with a stopover, null = not specified. */
  directFlight: boolean | null;
  makkahHotel: string | null;
  makkahArea: string | null;
  /** Walking distance from the Makkah hotel to the Haram, in metres. */
  haramDistanceM: number | null;
  /** Walking time to the Haram as typed by the agency, e.g. "10-12" (minutes). */
  walkMinutes: string | null;
  madinahHotel: string | null;
  hotelCategory: string | null;
  transport: string | null;
  roomOptions: string[];
  priceDzd: number | null;
  coverImage: string | null;
  isDemo: boolean;
  departures: Array<{
    id: string;
    departDate: string;
    returnDate: string | null;
    departureCity: string | null;
    priceDzd: number | null;
    seatsLeft: number;
    capacity: number;
  }>;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
