import { GENERIC_REF, type Locale } from "~/lib/constants";
import type { TFunction } from "~/i18n";
import type { PublicPackage } from "~/lib/types";
import type { PublicSite } from "~/server/site.server";

export const pkgName = (p: Pick<PublicPackage, "name" | "nameAr">, locale: Locale) =>
  locale === "ar" && p.nameAr ? p.nameAr : p.name;

export const pkgDescription = (p: Pick<PublicPackage, "description" | "descriptionAr">, locale: Locale) =>
  locale === "ar" && p.descriptionAr ? p.descriptionAr : p.description;

export const agencyName = (site: PublicSite, locale: Locale) =>
  locale === "ar" && site.agencyNameAr ? site.agencyNameAr : site.agencyName;

export const agencyAddress = (site: PublicSite, locale: Locale) =>
  locale === "ar" && site.addressAr ? site.addressAr : site.address;

/**
 * WhatsApp deep link. The prefilled text starts with the package reference in
 * brackets ("[OMR-01] …") so the CRM can link the incoming message to the offer.
 * Returns null until the agency has entered its WhatsApp number in Settings.
 * `message` replaces the generic sentence (service cards: "…about Turkey tours");
 * it still travels under the generic reference, so the CRM treats it as a website chat.
 */
export function buildWaLink(
  site: PublicSite,
  t: TFunction,
  pkg?: { refCode: string; title: string } | null,
  message?: string,
): string | null {
  if (!site.whatsappNumber) return null;
  const text = pkg
    ? `[${pkg.refCode}] ${t("site.wa.greeting")} ${pkg.title}`
    : `[${GENERIC_REF}] ${message ?? t("site.wa.generic")}`;
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

/** Lowest price a visitor can actually book: the cheapest open departure, else the package price. */
export function fromPrice(p: PublicPackage): number | null {
  const prices = p.departures.filter((d) => d.seatsLeft > 0).map((d) => d.priceDzd ?? p.priceDzd);
  const valid = prices.filter((v): v is number => typeof v === "number");
  return valid.length ? Math.min(...valid) : p.priceDzd;
}

const UTM_KEY = "site_utm";
/** Remembers ad campaign parameters for the visit so the contact form can attach them. */
export function captureUtm(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source") ?? (params.get("fbclid") ? "facebook" : null);
    const campaign = params.get("utm_campaign");
    if (source || campaign) sessionStorage.setItem(UTM_KEY, JSON.stringify({ source, campaign }));
  } catch {
    /* storage unavailable */
  }
}
export function readUtm(): { source: string | null; campaign: string | null } {
  try {
    return JSON.parse(sessionStorage.getItem(UTM_KEY) ?? "null") ?? { source: null, campaign: null };
  } catch {
    return { source: null, campaign: null };
  }
}
