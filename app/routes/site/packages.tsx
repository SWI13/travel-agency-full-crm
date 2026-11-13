import { useMemo, useState } from "react";
import { PACKAGE_CATEGORIES, type PackageCategory } from "~/lib/constants";
import { Link, useSearchParams } from "react-router";
import { ArrowUpDown } from "lucide-react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/format";
import { PackageCard, SectionHeading, WhatsAppLink } from "~/site/components";
import { fromPrice } from "~/site/helpers";
import { useSiteData } from "~/site/use-site-data";

const PAGE = 9;

export default function Packages() {
  const { site, packages } = useSiteData();
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const requested = params.get("c");
  const category = (PACKAGE_CATEGORIES as readonly string[]).includes(requested ?? "") ? (requested as PackageCategory) : "all";
  const tabs = ["all", ...PACKAGE_CATEGORIES.filter((c) => packages.some((p) => p.category === c))] as const;
  const sort = params.get("sort") === "price" ? "price" : "date";
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => {
    const list = packages.filter((p) => category === "all" || p.category === category);
    const byDate = (a: (typeof list)[number]) => a.departures[0]?.departDate ?? "9999";
    const byPrice = (a: (typeof list)[number]) => fromPrice(a) ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => (sort === "price" ? byPrice(a) - byPrice(b) : byDate(a).localeCompare(byDate(b))));
  }, [packages, category, sort]);

  const link = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    const query = copy.toString();
    return `/${locale}/packages${query ? `?${query}` : ""}`;
  };

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12">
      <SectionHeading title={t("site.packages.title")} subtitle={t("site.packages.subtitle")} />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <nav className="flex rounded-full border border-[var(--line)] p-1 bg-white" aria-label={t("site.packages.title")}>
          {tabs.map((c) => (
            <Link
              key={c}
              to={link({ c: c === "all" ? null : c })}
              aria-current={category === c ? "page" : undefined}
              className={cn(
                "px-4 h-9 grid place-items-center rounded-full text-sm font-semibold transition-colors",
                category === c ? "bg-petrol text-white" : "muted hover:text-[var(--ink)]",
              )}
            >
              {t(`site.packages.${c}`)}
            </Link>
          ))}
        </nav>
        <p className="text-sm font-semibold text-petrol">{t("site.packages.available", { n: visible.length })}</p>
        <div className="ms-auto flex items-center gap-2 text-sm">
          <ArrowUpDown className="size-4 muted" />
          <span className="muted">{t("site.packages.sortBy")}</span>
          {(["date", "price"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setParams(new URLSearchParams(link({ sort: s === "date" ? null : s }).split("?")[1] ?? ""), { replace: true, preventScrollReset: true })}
              className={cn("h-8 px-3 rounded-full font-semibold transition-colors", sort === s ? "bg-stone text-petrol" : "muted hover:text-[var(--ink)]")}
            >
              {t(s === "date" ? "site.packages.sortDate" : "site.packages.sortPrice")} ↑
            </button>
          ))}
        </div>
      </div>

      {visible.length ? (
        <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.slice(0, shown).map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} site={site} />
            ))}
          </div>
          {visible.length > shown && (
            <div className="mt-8 text-center">
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => setShown((n) => n + PAGE)}>
                {t("site.packages.showMore", { n: Math.min(PAGE, visible.length - shown) })}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-stone-dark bg-stone/50 px-6 py-16 text-center">
          <p className="font-semibold">{t("site.packages.empty")}</p>
          <p className="mt-1 text-sm muted">{t("site.packages.emptyCta")}</p>
          <div className="mt-5 flex justify-center gap-3">
            <WhatsAppLink site={site} />
            <Link to={`/${locale}/contact`} className="btn btn-secondary">{t("site.cta.callback")}</Link>
          </div>
        </div>
      )}
    </section>
  );
}
