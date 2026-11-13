import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, Layers, Phone, ShieldCheck, Tag, Users } from "lucide-react";
import { translate, useI18n } from "~/i18n";
import { cn } from "~/lib/format";
import { LeadForm, PackageCard, WhatsAppIcon, WhatsAppLink } from "~/site/components";
import { buildWaLink } from "~/site/helpers";
import { AlgeriaScene, HorizonScene, KaabaScene, TicketScene, TurkeyScene } from "~/site/illustrations";
import { useSiteData } from "~/site/use-site-data";

const SERVICES: Array<{ key: "umrah" | "turkey" | "domestic" | "visa"; Art: ComponentType<{ className?: string }> }> = [
  { key: "umrah", Art: KaabaScene },
  { key: "turkey", Art: TurkeyScene },
  { key: "domestic", Art: AlgeriaScene },
  { key: "visa", Art: TicketScene },
];

const REASONS = [
  { key: "i1", icon: Users },
  { key: "i2", icon: Tag },
  { key: "i3", icon: Layers },
] as const;

/** Small label above a section title, signed with the dotted path of the logo. */
function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={cn("inline-flex items-center gap-2.5 text-xs font-semibold", light ? "text-saffron-300" : "text-brand-500")}>
      <span className="flex items-center gap-1" aria-hidden="true">
        <i className="size-1.5 rounded-full bg-saffron opacity-40" />
        <i className="size-1.5 rounded-full bg-saffron opacity-70" />
        <i className="size-1.5 rounded-full bg-saffron" />
      </span>
      {children}
    </p>
  );
}

function Heading({ eyebrow, title, subtitle, center, light }: { eyebrow?: string; title: string; subtitle?: string; center?: boolean; light?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <Eyebrow light={light}>{eyebrow}</Eyebrow>}
      <h2 className={cn("mt-3 text-[1.7rem] sm:text-4xl font-extrabold leading-[1.3] text-balance", light ? "text-white" : "text-petrol")}>{title}</h2>
      {subtitle && <p className={cn("mt-3 text-[15px] sm:text-base leading-relaxed", light ? "text-brand-200" : "muted")}>{subtitle}</p>}
    </div>
  );
}

export default function Home() {
  const { site, packages } = useSiteData();
  const { t, locale, isRtl } = useI18n();
  const [category, setCategory] = useState<"all" | "umrah" | "hajj">("all");
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const visible = packages.filter((p) => category === "all" || p.category === category);
  const hasWhatsApp = !!site.whatsappNumber;
  const tel = site.phone ? `tel:${site.phone.replace(/\s/g, "")}` : null;
  /** On the Arabic site, the English name sits under the Arabic one as an accent. */
  const accent = (key: string) => (locale === "ar" ? translate("en", key) : null);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-[linear-gradient(180deg,#051c21_0%,#0d3b44_58%,#11505c_100%)] text-white">
        <div className="absolute inset-0 -z-10 pattern-star opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" aria-hidden="true" />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-10 sm:pt-16 lg:pt-20 text-center">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[11px] sm:text-xs font-medium text-saffron-300 ring-1 ring-inset ring-white/15">
            <span className="size-1.5 shrink-0 rounded-full bg-saffron" />
            {t("site.hero.eyebrow")}
          </p>

          <h1 className="mt-5 text-[clamp(1.5rem,7.2vw,2rem)] sm:text-5xl lg:text-6xl font-extrabold leading-[1.4] sm:leading-[1.3] lg:leading-[1.25] text-balance">
            {t("site.hero.title")}
            <span className="block text-saffron">{t("site.hero.titleAccent")}</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[15px] sm:text-lg leading-[1.9] sm:leading-[1.8] text-brand-100/90">{t("site.hero.subtitle")}</p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            {hasWhatsApp ? (
              <WhatsAppLink
                site={site}
                className="h-14 rounded-2xl px-8 text-lg font-bold shadow-[0_14px_34px_-10px_rgb(31_170_89/0.75)] [&>svg]:size-6"
              >
                {t("site.hero.cta")}
              </WhatsAppLink>
            ) : (
              <a href="#contact" className="btn h-14 rounded-2xl px-8 text-lg font-bold bg-saffron text-ink hover:bg-saffron-300">
                {t("site.cta.callback")}
              </a>
            )}
            <Link
              to={`/${locale}/packages`}
              className="btn h-14 rounded-2xl px-6 text-base text-white ring-1 ring-inset ring-white/25 hover:bg-white/10"
            >
              {t("site.cta.packages")}
              <Arrow className="size-4" />
            </Link>
          </div>

          {(hasWhatsApp || tel) && (
            <p className="mt-4 text-[13px] sm:text-sm text-brand-200">
              {hasWhatsApp && t("site.hero.note")}
              {hasWhatsApp && tel && <span className="mx-2 opacity-50">·</span>}
              {tel && (
                <>
                  {t("site.hero.orCall")}{" "}
                  <a href={tel} className="ltr-inline font-semibold text-white underline decoration-saffron/70 underline-offset-4 hover:decoration-saffron">
                    {site.phone}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <HorizonScene className="block w-full h-40 sm:h-52 lg:h-auto lg:aspect-[1440/300] mt-4 lg:-mt-6" />
      </section>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <section className="bg-stone" aria-labelledby="services-title">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-24">
          <div className="max-w-2xl mx-auto text-center">
            <Eyebrow>{t("site.services.eyebrow")}</Eyebrow>
            <h2 id="services-title" className="mt-3 text-[1.7rem] sm:text-4xl font-extrabold leading-[1.3] text-petrol text-balance">
              {t("site.services.title")}
            </h2>
            <p className="mt-3 text-[15px] sm:text-base leading-relaxed muted">{t("site.services.subtitle")}</p>
          </div>

          <ul className="mt-9 sm:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {SERVICES.map(({ key, Art }) => {
              const wa = buildWaLink(site, t, null, t(`site.wa.${key}`));
              const latin = accent(`site.services.${key}`);
              return (
                <li key={key} className="min-w-0">
                  <a
                    href={wa ?? "#contact"}
                    {...(wa ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-stone-dark shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift hover:ring-saffron"
                  >
                    <div className="relative aspect-[5/4] overflow-hidden bg-brand-700">
                      <Art className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-105" />
                    </div>
                    <div className="flex flex-1 flex-col p-3.5 sm:p-5">
                      <h3 className="text-[15px] sm:text-lg font-bold leading-snug text-petrol">{t(`site.services.${key}`)}</h3>
                      {latin && (
                        <p className="mt-0.5 text-[11px] font-medium tracking-wide text-brand-400">
                          <span className="ltr-inline">{latin}</span>
                        </p>
                      )}
                      <p className="mt-2 flex-1 text-[13px] sm:text-sm leading-relaxed muted">{t(`site.services.${key}Text`)}</p>
                      <span className={cn("mt-4 inline-flex items-center gap-1.5 text-[12.5px] sm:text-sm font-semibold", wa ? "text-whatsapp-dark" : "text-petrol")}>
                        {wa && <WhatsAppIcon className="size-4 shrink-0" />}
                        {wa ? t("site.services.ask") : t("site.services.askForm")}
                        <Arrow className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Packages ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Heading title={t("site.packages.title")} subtitle={t("site.packages.subtitle")} />
          <div className="flex rounded-full border border-[var(--line)] p-1 bg-white" role="tablist">
            {(["all", "umrah", "hajj"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "px-4 h-9 rounded-full text-sm font-semibold transition-colors",
                  category === c ? "bg-brand-600 text-white" : "muted hover:text-[var(--ink)]",
                )}
              >
                {t(`site.packages.${c}`)}
              </button>
            ))}
          </div>
        </div>

        {visible.length ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.slice(0, 6).map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} site={site} />
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 px-6 py-14 text-center">
            <p className="font-semibold">{t("site.packages.empty")}</p>
            <p className="mt-1 text-sm muted">{t("site.packages.emptyCta")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <WhatsAppLink site={site} />
              <a href="#contact" className="btn btn-secondary">{t("site.cta.callback")}</a>
            </div>
          </div>
        )}
        {visible.length > 6 && (
          <div className="mt-8 text-center">
            <Link to={`/${locale}/packages`} className="btn btn-secondary">
              {t("site.cta.packages")}
              <Arrow className="size-4" />
            </Link>
          </div>
        )}
      </section>

      {/* ── Why choose us ────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-petrol text-white mt-16 sm:mt-24" aria-labelledby="why-title">
        <img
          src="/brand/mark-reversed.svg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none select-none absolute -z-10 -bottom-24 -start-28 w-[30rem] max-w-none opacity-[0.05]"
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-24 grid gap-8 lg:gap-16 lg:grid-cols-[1fr_1.25fr] lg:items-center">
          <div>
            <Eyebrow light>{t("site.why.eyebrow")}</Eyebrow>
            <h2 id="why-title" className="mt-3 text-[1.7rem] sm:text-4xl font-extrabold leading-[1.35] text-balance">
              {t("site.why.title")}
            </h2>
            {site.licenseNumber && (
              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-xs font-medium text-brand-100 ring-1 ring-inset ring-white/15">
                <ShieldCheck className="size-4 text-saffron" />
                {t("site.trust.licenceNo", { n: site.licenseNumber })}
              </p>
            )}
            <div className="mt-7 hidden lg:flex flex-wrap gap-3">
              <WhatsAppLink site={site} className="btn-lg" />
              {!hasWhatsApp && (
                <a href="#contact" className="btn btn-lg bg-saffron text-ink hover:bg-saffron-300">{t("site.cta.callback")}</a>
              )}
            </div>
          </div>

          <ol className="border-t border-white/10">
            {REASONS.map(({ key, icon: Icon }, index) => (
              <li key={key} className="flex items-center gap-4 sm:gap-6 border-b border-white/10 py-5 sm:py-7">
                <span className="w-10 sm:w-14 shrink-0 text-2xl sm:text-4xl font-extrabold tabular text-saffron" aria-hidden="true">
                  0{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-medium tracking-wide text-brand-300">
                    <span className={cn(locale === "ar" && "ltr-inline")}>{accent(`site.why.${key}`) ?? t(`site.why.${key}`)}</span>
                  </p>
                  <h3 className="mt-1 text-base sm:text-xl font-bold leading-snug">{t(`site.why.${key}Text`)}</h3>
                </div>
                <span className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-full bg-white/[0.07] text-saffron ring-1 ring-inset ring-white/10">
                  <Icon className="size-5" />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24">
        <Heading eyebrow={t("site.how.eyebrow")} title={t("site.how.title")} center />
        <div className="relative mt-10 sm:mt-14">
          {/* the dotted path of the logo links the three steps */}
          <div className="hidden md:block absolute top-6 inset-x-[16.66%] border-t-[3px] border-dotted border-saffron" aria-hidden="true" />
          <ol className="relative grid gap-8 md:grid-cols-3 md:gap-8">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="relative flex items-start gap-4 md:flex-col md:items-center md:text-center after:absolute after:top-14 after:-bottom-6 after:start-6 after:-ms-[1.5px] after:border-s-[3px] after:border-dotted after:border-saffron last:after:hidden md:after:hidden"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-petrol text-lg font-bold text-saffron tabular ring-8 ring-white">
                  {n}
                </span>
                <div className="min-w-0 pt-1 md:pt-2">
                  <h3 className="text-lg font-bold text-petrol">{t(`site.how.s${n}t`)}</h3>
                  <p className="mt-1.5 text-sm muted leading-relaxed md:max-w-[17rem] md:mx-auto">{t(`site.how.s${n}d`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Contact form ─────────────────────────────────────────────────── */}
      <section id="contact" className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24 scroll-mt-20">
        <div className="relative isolate overflow-hidden rounded-3xl sm:rounded-[2rem] bg-petrol text-white p-5 sm:p-10 lg:p-12 grid gap-8 lg:gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="absolute inset-0 -z-10 pattern-star" aria-hidden="true" />
          <div>
            <Heading light title={t("site.form.title")} subtitle={t("site.form.subtitle")} />
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <WhatsAppLink site={site} className="btn-lg" />
              {tel && (
                <a href={tel} className="btn btn-lg bg-white/[0.08] text-white ring-1 ring-inset ring-white/20 hover:bg-white/15">
                  <Phone className="size-4" />
                  <span className="ltr-inline">{site.phone}</span>
                </a>
              )}
            </div>
            {site.hours && <p className="mt-5 text-sm text-brand-200">{t("site.contact.hours")} · {site.hours}</p>}
          </div>
          <div className="rounded-2xl bg-white text-[var(--ink)] p-5 sm:p-7 shadow-lift">
            <LeadForm packages={packages} />
          </div>
        </div>
      </section>
    </>
  );
}
