import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { dirOf, type Locale } from "~/lib/constants";
import { crmAr } from "./locales/crm.ar";
import { crmEn } from "./locales/crm.en";
import { crmFr } from "./locales/crm.fr";
import { siteAr } from "./locales/site.ar";
import { siteEn } from "./locales/site.en";
import { siteFr } from "./locales/site.fr";

/**
 * Localisation: one dictionary per language and namespace ("site", "crm").
 * Keys are dot paths ("crm.leads.title"); `{name}` placeholders are replaced
 * from params. A missing translation falls back to English, then to the key.
 */

const DICTIONARIES: Record<Locale, Record<string, unknown>> = {
  en: { site: siteEn, crm: crmEn },
  fr: { site: siteFr, crm: crmFr },
  ar: { site: siteAr, crm: crmAr },
};

export type Params = Record<string, string | number | null | undefined>;

function lookup(dictionary: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const template = lookup(DICTIONARIES[locale], key) ?? lookup(DICTIONARIES.en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export const hasTranslation = (key: string) => lookup(DICTIONARIES.en, key) !== undefined;

const I18nContext = createContext<Locale>("fr");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export type TFunction = (key: string, params?: Params) => string;

export function useI18n() {
  const locale = useContext(I18nContext);
  const t = useCallback<TFunction>((key, params) => translate(locale, key, params), [locale]);
  return useMemo(() => ({ t, locale, dir: dirOf(locale), isRtl: dirOf(locale) === "rtl" }), [t, locale]);
}
