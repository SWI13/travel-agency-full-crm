import { Link } from "react-router";
import { MapPin, ShieldCheck } from "lucide-react";
import { useI18n } from "~/i18n";
import { WhatsAppLink } from "~/site/components";
import { agencyAddress, agencyName } from "~/site/helpers";
import { useSiteData } from "~/site/use-site-data";

export default function About() {
  const { site } = useSiteData();
  const { t, locale } = useI18n();
  const address = agencyAddress(site, locale);
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-14">
      <p className="eyebrow text-brand-600">{agencyName(site, locale)}</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{t("site.about.title")}</h1>
      <p className="mt-5 text-xl leading-relaxed text-brand-900">{t("site.about.lead")}</p>
      <p className="mt-5 leading-relaxed muted">{t("site.about.p1")}</p>
      <p className="mt-4 leading-relaxed muted">{t("site.about.p2")}</p>

      <dl className="mt-10 grid gap-4 sm:grid-cols-2">
        {site.licenseNumber && (
          <div className="flex gap-3 rounded-2xl border border-[var(--line)] p-5">
            <span className="grid place-items-center size-10 rounded-xl bg-brand-50 text-brand-700 shrink-0"><ShieldCheck className="size-5" /></span>
            <div>
              <dt className="text-xs muted">{t("site.about.licence")}</dt>
              <dd className="font-bold ltr-inline">{site.licenseNumber}</dd>
            </div>
          </div>
        )}
        {address && (
          <div className="flex gap-3 rounded-2xl border border-[var(--line)] p-5">
            <span className="grid place-items-center size-10 rounded-xl bg-brand-50 text-brand-700 shrink-0"><MapPin className="size-5" /></span>
            <div>
              <dt className="text-xs muted">{t("site.about.visit")}</dt>
              <dd className="font-semibold">{address}</dd>
            </div>
          </div>
        )}
      </dl>

      <div className="mt-10 flex flex-wrap gap-3">
        <WhatsAppLink site={site} className="btn-lg" />
        <Link to={`/${locale}/packages`} className="btn btn-secondary btn-lg">{t("site.cta.packages")}</Link>
      </div>
    </section>
  );
}
