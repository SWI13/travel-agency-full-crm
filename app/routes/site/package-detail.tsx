import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, BedDouble, Bus, Clock, Footprints, Hotel, MapPin, Navigation, Plane, Star } from "lucide-react";
import type { Route } from "./+types/package-detail";
import { translate, useI18n } from "~/i18n";
import { isLocale } from "~/lib/constants";
import { cn, formatDate, formatDzd } from "~/lib/format";
import { LeadForm, PackageCover, useDistance, WhatsAppLink } from "~/site/components";
import { fromPrice, pkgDescription, pkgName } from "~/site/helpers";
import { useSiteData } from "~/site/use-site-data";

export function meta({ params, matches }: Route.MetaArgs) {
  const layout = matches.find((m) => m?.id === "routes/site/layout")?.data as
    | { packages: Array<{ slug: string; name: string; nameAr: string | null; description: string | null }> }
    | undefined;
  const pkg = layout?.packages.find((p) => p.slug === params.slug);
  const lang = isLocale(params.lang) ? params.lang : "ar";
  if (!pkg) return [{ title: translate(lang, "site.detail.notFound") }];
  return [
    { title: `${pkgName(pkg, lang)} — ${translate(lang, "site.meta.title")}` },
    { name: "description", content: (pkg.description ?? translate(lang, "site.meta.description")).slice(0, 160) },
  ];
}

export default function PackageDetail() {
  const { site, packages } = useSiteData();
  const { slug } = useParams();
  const { t, locale, isRtl } = useI18n();
  const distance = useDistance();
  const pkg = packages.find((p) => p.slug === slug);
  const Back = isRtl ? ArrowRight : ArrowLeft;

  if (!pkg) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">{t("site.detail.notFound")}</h1>
        <Link to={`/${locale}/packages`} className="btn btn-primary mt-6">{t("site.detail.back")}</Link>
      </section>
    );
  }

  const title = pkgName(pkg, locale);
  const description = pkgDescription(pkg, locale);
  const price = fromPrice(pkg);
  const facts = [
    { icon: Clock, label: t("site.detail.duration"), value: pkg.durationDays ? t("site.packages.days", { n: pkg.durationDays }) : null },
    { icon: MapPin, label: t("site.detail.departureCity"), value: pkg.departureCity },
    { icon: Hotel, label: t("site.detail.makkahHotel"), value: pkg.makkahHotel },
    { icon: MapPin, label: t("site.detail.area"), value: pkg.makkahArea },
    { icon: Navigation, label: t("site.detail.distance"), value: pkg.haramDistanceM != null ? distance(pkg.haramDistanceM) : null },
    { icon: Footprints, label: t("site.detail.walkTime"), value: pkg.walkMinutes ? t("site.packages.walk", { n: pkg.walkMinutes }) : null },
    { icon: Hotel, label: t("site.detail.madinahHotel"), value: pkg.madinahHotel },
    { icon: Star, label: t("site.detail.hotelCategory"), value: pkg.hotelCategory },
    { icon: Plane, label: t("site.detail.airline"), value: pkg.airline },
    { icon: Plane, label: t("site.detail.flightType"), value: pkg.directFlight == null ? null : pkg.directFlight ? t("site.packages.direct") : t("site.packages.indirect") },
    { icon: Plane, label: t("site.detail.flight"), value: pkg.flightInfo },
    { icon: Bus, label: t("site.detail.transport"), value: pkg.transport },
    {
      icon: BedDouble,
      label: t("site.detail.rooms"),
      value: pkg.roomOptions.length ? pkg.roomOptions.map((r) => t(`site.rooms.${r}`)).join(" · ") : null,
    },
  ].filter((f) => f.value);

  return (
    <article className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
      <Link to={`/${locale}/packages`} className="inline-flex items-center gap-1.5 text-sm font-medium muted hover:text-brand-700">
        <Back className="size-4" />
        {t("site.detail.back")}
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1fr_22rem] items-start">
        <div className="min-w-0">
          <PackageCover pkg={pkg} className="h-56 sm:h-80 rounded-3xl" />
          <h1 className="mt-7 text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm muted">
            {t("site.detail.ref")} <span className="ltr-inline font-mono font-semibold text-[var(--ink)]">{pkg.refCode}</span>
          </p>

          {facts.length > 0 && (
            <dl className="mt-8 grid gap-px sm:grid-cols-2 rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--line)]">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex gap-3 bg-white p-4">
                  <span className="grid place-items-center size-9 rounded-xl bg-brand-50 text-brand-700 shrink-0">
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs muted">{label}</dt>
                    <dd className="font-semibold break-words">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          {description && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">{t("site.detail.overview")}</h2>
              <p className="mt-3 leading-relaxed whitespace-pre-line text-[15px]">{description}</p>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-xl font-bold">{t("site.detail.departures")}</h2>
            {pkg.departures.length ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)]">
                <table className="data-table min-w-[30rem]">
                  <thead>
                    <tr>
                      <th>{t("site.detail.date")}</th>
                      <th>{t("site.detail.return")}</th>
                      <th>{t("site.detail.price")}</th>
                      <th>{t("site.detail.seats")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.departures.map((d) => (
                      <tr key={d.id} className={cn(d.seatsLeft === 0 && "opacity-55")}>
                        <td className="font-semibold">{formatDate(d.departDate, locale)}</td>
                        <td>{formatDate(d.returnDate, locale)}</td>
                        <td className="tabular font-semibold">{formatDzd(d.priceDzd ?? pkg.priceDzd, locale)}</td>
                        <td>
                          <span className={cn("badge", d.seatsLeft === 0 ? "tone-rose" : d.seatsLeft <= 10 ? "tone-amber" : "tone-emerald")}>
                            {d.seatsLeft === 0 ? t("site.packages.full") : t("site.packages.seatsLeft", { n: d.seatsLeft })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm muted">{t("site.detail.noDepartures")}</p>
            )}
          </section>
        </div>

        {/* Sticky price box */}
        <aside className="lg:sticky lg:top-24 rounded-3xl border border-brand-100 bg-white shadow-soft p-6">
          {price != null ? (
            <>
              <p className="text-sm muted">{t("site.packages.from")}</p>
              <p className="text-3xl font-extrabold text-brand-700 tabular">{formatDzd(price, locale)}</p>
              <p className="text-xs muted">{t("site.packages.perPerson")}</p>
            </>
          ) : (
            <p className="text-lg font-bold">{t("site.packages.priceOnRequest")}</p>
          )}
          <WhatsAppLink site={site} pkg={{ refCode: pkg.refCode, title }} className="btn-lg w-full mt-5" />
          <div className={cn("pt-5", site.whatsappNumber && "mt-5 border-t border-[var(--line)]")}>
            <h2 className="font-bold">{t("site.form.title")}</h2>
            <p className="text-sm muted mb-4">{t("site.form.subtitle")}</p>
            <LeadForm packages={packages} defaultSlug={pkg.slug} compact />
          </div>
        </aside>
      </div>
    </article>
  );
}
