import { Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { useI18n } from "~/i18n";
import { LeadForm, SectionHeading, WhatsAppLink } from "~/site/components";
import { agencyAddress } from "~/site/helpers";
import { useSiteData } from "~/site/use-site-data";

export default function Contact() {
  const { site, packages } = useSiteData();
  const { t, locale } = useI18n();
  const address = agencyAddress(site, locale);
  const rows = [
    { icon: MapPin, label: t("site.contact.address"), value: address, href: site.mapsUrl, ltr: false },
    { icon: Phone, label: t("site.contact.phone"), value: site.phone, href: site.phone ? `tel:${site.phone.replace(/\s/g, "")}` : null, ltr: true },
    { icon: Mail, label: t("site.contact.email"), value: site.email, href: site.email ? `mailto:${site.email}` : null, ltr: true },
    { icon: Clock, label: t("site.contact.hours"), value: site.hours, href: null, ltr: false },
  ].filter((row) => row.value);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 grid gap-12 lg:grid-cols-[1fr_1.15fr]">
      <div>
        <SectionHeading title={t("site.contact.title")} subtitle={t("site.contact.subtitle")} />
        <div className="mt-6">
          <WhatsAppLink site={site} className="btn-lg" />
        </div>
        {rows.length ? (
          <dl className="mt-8 grid gap-3">
            {rows.map(({ icon: Icon, label, value, href, ltr }) => (
              <div key={label} className="flex gap-3 rounded-2xl border border-[var(--line)] p-4">
                <span className="grid place-items-center size-10 rounded-xl bg-brand-50 text-brand-700 shrink-0"><Icon className="size-5" /></span>
                <div className="min-w-0">
                  <dt className="text-xs muted">{label}</dt>
                  <dd className="font-semibold break-words">
                    {href ? (
                      <a href={href} className="hover:text-brand-700" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                        <span className={ltr ? "ltr-inline" : undefined}>{value}</span>
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-8 rounded-2xl bg-brand-50 border border-brand-100 p-4 text-sm">{t("site.contact.pending")}</p>
        )}
        {site.mapsUrl && (
          <a href={site.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
            {t("site.contact.map")}
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <div className="rounded-3xl border border-brand-100 bg-white shadow-soft p-6 sm:p-8 h-fit">
        <h2 className="text-xl font-bold">{t("site.form.title")}</h2>
        <p className="text-sm muted mb-5">{t("site.form.subtitle")}</p>
        <LeadForm packages={packages} />
      </div>
    </section>
  );
}
