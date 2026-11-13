import { data, Link } from "react-router";
import { useI18n } from "~/i18n";

export function loader() {
  return data(null, { status: 404 });
}

export default function SiteNotFound() {
  const { t, locale } = useI18n();
  return (
    <section className="mx-auto max-w-xl px-4 py-28 text-center">
      <p className="text-7xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold">{t("site.notFound.title")}</h1>
      <p className="mt-2 muted">{t("site.notFound.body")}</p>
      <Link to={`/${locale}`} className="btn btn-primary mt-6">{t("site.notFound.home")}</Link>
    </section>
  );
}
