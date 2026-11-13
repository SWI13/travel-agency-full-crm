import { Link } from "react-router";
import { CircleCheck } from "lucide-react";
import { useI18n } from "~/i18n";
import { WhatsAppLink } from "~/site/components";
import { useSiteData } from "~/site/use-site-data";

export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export default function ThankYou() {
  const { site } = useSiteData();
  const { t, locale } = useI18n();
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center">
      <span className="inline-grid place-items-center size-16 rounded-full bg-emerald-50 text-emerald-600">
        <CircleCheck className="size-9" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold">{t("site.thanks.title")}</h1>
      <p className="mt-3 text-lg muted">{t("site.thanks.body")}</p>
      {site.hours && <p className="mt-1 text-sm muted">{t("site.contact.hours")} · {site.hours}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <WhatsAppLink site={site} className="btn-lg">{t("site.thanks.whatsapp")}</WhatsAppLink>
        <Link to={`/${locale}/packages`} className="btn btn-secondary btn-lg">{t("site.thanks.back")}</Link>
      </div>
    </section>
  );
}
