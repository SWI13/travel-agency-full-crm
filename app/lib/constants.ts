/** Domain enums shared by the server, the CRM and the public website. */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "package_sent",
  "awaiting_documents",
  "awaiting_deposit",
  "confirmed",
  "travel_preparation",
  "completed",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages that count as an active sales conversation. */
export const OPEN_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "package_sent",
  "awaiting_documents",
  "awaiting_deposit",
];
/** Stages reached once the customer has committed. */
export const WON_STAGES: LeadStage[] = ["confirmed", "travel_preparation", "completed"];
export const QUALIFIED_STAGES: LeadStage[] = [
  "qualified",
  "package_sent",
  "awaiting_documents",
  "awaiting_deposit",
];

export const SERVICE_TYPES = ["unknown", "umrah", "hajj"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const LEAD_SOURCES = [
  "facebook_ad",
  "instagram_ad",
  "meta_ad",
  "meta_post",
  "organic",
  "website_whatsapp",
  "website_form",
  "manual",
  "unknown",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const AD_SOURCES: LeadSource[] = ["facebook_ad", "instagram_ad", "meta_ad"];

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/** Bookings in these states no longer hold seats or count as revenue. */
export const VOID_PAYMENT_STATUSES: PaymentStatus[] = ["refunded", "cancelled"];

export const ROLES = ["admin", "manager", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const PACKAGE_CATEGORIES = ["umrah", "hajj"] as const;
export type PackageCategory = (typeof PACKAGE_CATEGORIES)[number];

export const PACKAGE_STATUSES = ["draft", "active", "sold_out", "archived"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const DEPARTURE_STATUSES = ["open", "closed", "departed", "cancelled"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];

export const VISA_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
] as const;
export type VisaStatus = (typeof VISA_STATUSES)[number];

export const ROOM_TYPES = ["single", "double", "triple", "quad"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const FOLLOWUP_REASONS = [
  "call_back",
  "send_offer",
  "documents",
  "deposit",
  "other",
] as const;
export type FollowUpReason = (typeof FOLLOWUP_REASONS)[number];

export const LOCALES = ["fr", "ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: Locale[] = ["ar"];
export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
export const dirOf = (l: Locale) => (RTL_LOCALES.includes(l) ? "rtl" : "ltr");

export const ACTIVITY_ACTIONS = [
  "lead_created",
  "message_in",
  "message_out",
  "lead_assigned",
  "stage_changed",
  "lead_updated",
  "package_selected",
  "booking_created",
  "booking_updated",
  "payment_updated",
  "followup_scheduled",
  "followup_completed",
  "followup_rescheduled",
  "package_created",
  "package_updated",
  "package_archived",
  "departure_created",
  "departure_updated",
  "staff_created",
  "staff_updated",
  "settings_updated",
  "integration_event",
  "webhook_error",
  "demo_data",
  "login",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const DEFAULT_CHECKLIST = [
  { key: "passport", label: "Passport received" },
  { key: "photos", label: "Photographs received" },
  { key: "documents", label: "Required documents received" },
  { key: "final_prep", label: "Final travel preparation" },
];

/** Website WhatsApp links start with a reference code such as [OMR-01]. */
export const REF_CODE_RE = /^\s*\[([A-Z]{3}-\d{2,4})\]/;
export const GENERIC_REF = "WEB-00";

/** phone_number_id used by simulated (demo) webhook events. */
export const DEMO_PHONE_NUMBER_ID = "DEMO";
