import { useI18n } from "~/i18n";

export default function Privacy() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-14">
      <h1 className="text-4xl font-extrabold tracking-tight">{t("site.privacy.title")}</h1>
      <p className="mt-4 text-lg muted">{t("site.privacy.intro")}</p>
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="mt-8">
          <h2 className="text-xl font-bold">{t(`site.privacy.h${n}`)}</h2>
          <p className="mt-2 leading-relaxed muted">{t(`site.privacy.p${n}`)}</p>
        </div>
      ))}
    </section>
  );
}
