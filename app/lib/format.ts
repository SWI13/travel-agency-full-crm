import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Western digits everywhere (the convention in Algeria, including Arabic text).
const INTL: Record<Locale, string> = { fr: "fr-DZ", ar: "ar-DZ-u-nu-latn", en: "en-GB" };
export const intlLocale = (l: Locale) => INTL[l];

/** 285000 -> "285 000 DA" / "285 000 دج" / "DZD 285,000". */
export function formatDzd(amount: number | null | undefined, locale: Locale): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const n = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  if (locale === "ar") return `${n} دج`;
  if (locale === "en") return `DZD ${n}`;
  return `${n} DA`;
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale]).format(n);
}

export function formatDate(
  iso: string | null | undefined,
  locale: Locale,
  style: "short" | "medium" | "long" = "medium",
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : style === "long"
        ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(INTL[locale], opts).format(d);
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL[locale], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(INTL[locale], { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** "3 min ago" style relative time, localised. */
export function timeAgo(iso: string | null | undefined, locale: Locale, now = Date.now()): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(INTL[locale], { numeric: "auto", style: "short" });
  if (abs < 45_000) return rtf.format(0, "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  return formatDate(iso, locale);
}

/** yyyy-mm-dd in local time, for <input type="date"> and day bucketing. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Value for <input type="datetime-local"> from an ISO string. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dayKey(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function initials(name: string | null | undefined): string {
  // Words that start with a letter only, so "Sara (démo)" gives "S", not "S(".
  const parts = (name ?? "").trim().split(/\s+/).filter((part) => /^\p{L}/u.test(part));
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "package"
  );
}

/** Best label for a lead: employee-entered name, then WhatsApp name, then phone. */
export function leadName(lead: {
  displayName?: string | null;
  waName?: string | null;
  waUsername?: string | null;
  phone?: string | null;
}): string {
  return (
    lead.displayName?.trim() ||
    lead.waName?.trim() ||
    (lead.waUsername ? `@${lead.waUsername}` : "") ||
    (lead.phone ? `\u2066${lead.phone}\u2069` : "") ||
    "—"
  );
}
