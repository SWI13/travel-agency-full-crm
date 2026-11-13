import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Footprints,
  Hotel,
  LoaderCircle,
  MapPin,
  Menu,
  Navigation,
  Phone,
  Plane,
  X,
} from "lucide-react";
import { useI18n } from "~/i18n";
import { LOCALES, type Locale } from "~/lib/constants";
import { cn, formatDate, formatDzd } from "~/lib/format";
import type { PublicPackage } from "~/lib/types";
import type { PublicSite } from "~/server/site.server";
import { agencyName, buildWaLink, fromPrice, pkgName, readUtm } from "./helpers";
import { KaabaScene } from "./illustrations";

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={cn("size-5", className)}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.38c.01-4.54 3.7-8.24 8.25-8.24Zm-3.52 4.2c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.76 2.67 4.25 3.74.59.26 1.05.41 1.41.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.23-.16-.48-.29-.25-.12-1.47-.72-1.69-.81-.23-.08-.4-.12-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23a7.4 7.4 0 0 1-1.38-1.72c-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43h-.49Z" />
    </svg>
  );
}

/** YourTour logo (D-Loop). The artwork already carries the Latin and Arabic names. */
export function BrandLogo({ reversed, className, alt }: { reversed?: boolean; className?: string; alt: string }) {
  return (
    <img
      src={reversed ? "/brand/logo-horizontal-reversed.svg" : "/brand/logo-horizontal.svg"}
      alt={alt}
      width={643}
      height={173}
      className={cn("h-11 w-auto select-none", className)}
      draggable={false}
    />
  );
}

export function WhatsAppLink({
  site,
  pkg,
  message,
  className,
  children,
}: {
  site: PublicSite;
  pkg?: { refCode: string; title: string } | null;
  /** Prefilled sentence when the link is about a service rather than a package. */
  message?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const href = buildWaLink(site, t, pkg, message);
  if (!href) return null; // hidden until the agency sets its WhatsApp number
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("btn btn-whatsapp", className)}>
      <WhatsAppIcon />
      {children ?? t("site.cta.whatsapp")}
    </a>
  );
}

/** Round WhatsApp button that stays in the corner on larger screens (phones get the bottom bar). */
export function FloatingWhatsApp({ site }: { site: PublicSite }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const href = buildWaLink(site, t);
  if (!href || pathname.endsWith("/thank-you")) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("site.cta.whatsapp")}
      title={t("site.cta.whatsapp")}
      className="hidden md:grid fixed bottom-6 right-6 z-40 size-14 place-items-center rounded-full bg-whatsapp text-white shadow-lift transition-transform hover:scale-105 hover:bg-whatsapp-dark"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}

function LanguageSwitch() {
  const { locale } = useI18n();
  const { pathname, search } = useLocation();
  const rest = pathname.replace(/^\/(ar|fr|en)(?=\/|$)/, "");
  const labels: Record<Locale, string> = { ar: "العربية", fr: "Français", en: "English" };
  return (
    <div className="flex items-center rounded-full border border-[var(--line)] p-0.5 bg-white" role="group" aria-label="Language">
      {(["ar", "fr", "en"] as Locale[]).filter((l) => LOCALES.includes(l)).map((l) => (
        <Link
          key={l}
          to={`/${l}${rest}${search}`}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          title={labels[l]}
          className={cn(
            "px-2.5 h-7 grid place-items-center rounded-full text-xs font-semibold uppercase transition-colors",
            l === locale ? "bg-brand-600 text-white" : "text-[var(--muted)] hover:text-[var(--ink)]",
          )}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}

export function SiteHeader({ site }: { site: PublicSite }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  const nav = [
    { to: `/${locale}`, label: t("site.nav.home"), end: true },
    { to: `/${locale}/packages`, label: t("site.nav.packages") },
    { to: `/${locale}/about`, label: t("site.nav.about") },
    { to: `/${locale}/contact`, label: t("site.nav.contact") },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[var(--line)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-[4.5rem] flex items-center gap-4">
        <Link to={`/${locale}`} className="flex items-center min-w-0 shrink-0" aria-label={agencyName(site, locale)}>
          <BrandLogo alt={agencyName(site, locale)} className="h-10 sm:h-11" />
        </Link>

        <nav className="hidden md:flex items-center gap-1 ms-6">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "px-3 h-9 grid place-items-center rounded-lg text-sm font-medium transition-colors",
                  isActive ? "text-petrol bg-stone" : "text-[var(--muted)] hover:text-[var(--ink)]",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitch />
          <WhatsAppLink site={site} className="hidden sm:inline-flex" />
          <button type="button" className="icon-btn md:hidden" aria-label={t("site.nav.menu")} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-[var(--line)] bg-white px-4 py-3 grid gap-1 animate-fade-in">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn("px-3 py-2.5 rounded-lg font-medium", isActive ? "bg-brand-50 text-brand-700" : "text-[var(--ink)]")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter({ site }: { site: PublicSite }) {
  const { t, locale } = useI18n();
  return (
    <footer className="bg-petrol text-brand-100 mt-24 relative overflow-hidden">
      {/* the logo's dotted flight path, as a quiet signature across the top of the footer */}
      <div className="absolute inset-x-0 top-0 h-px bg-[repeating-linear-gradient(90deg,var(--color-saffron)_0_6px,transparent_6px_16px)] opacity-70" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <BrandLogo reversed alt={agencyName(site, locale)} className="h-14" />
          <p className="mt-3 text-[11px] font-semibold tracking-[0.28em] text-saffron" dir="ltr">VOYAGES &amp; TOURISME · BATNA 05</p>
          <p className="mt-4 text-sm leading-relaxed text-brand-200 max-w-sm">{t("site.about.lead")}</p>
          {site.licenseNumber && (
            <p className="mt-3 text-xs text-brand-300">{t("site.trust.licenceNo", { n: site.licenseNumber })}</p>
          )}
        </div>
        <div className="text-sm">
          <p className="font-semibold text-white mb-3">{t("site.nav.packages")}</p>
          <ul className="grid gap-2 text-brand-200">
            <li><Link className="hover:text-white" to={`/${locale}/packages?c=umrah`}>{t("site.packages.umrah")}</Link></li>
            <li><Link className="hover:text-white" to={`/${locale}/packages?c=hajj`}>{t("site.packages.hajj")}</Link></li>
            <li><Link className="hover:text-white" to={`/${locale}/about`}>{t("site.nav.about")}</Link></li>
            <li><Link className="hover:text-white" to={`/${locale}/privacy`}>{t("site.footer.privacy")}</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-white mb-3">{t("site.nav.contact")}</p>
          <ul className="grid gap-2 text-brand-200">
            {site.phone && (
              <li><a className="hover:text-white ltr-inline" href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a></li>
            )}
            {site.email && <li><a className="hover:text-white" href={`mailto:${site.email}`}>{site.email}</a></li>}
            {site.hours && <li>{site.hours}</li>}
            {site.facebookUrl && <li><a className="hover:text-white" href={site.facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a></li>}
            {site.instagramUrl && <li><a className="hover:text-white" href={site.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a></li>}
            <li><Link className="hover:text-white" to={`/${locale}/contact`}>{t("site.cta.callback")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-300">
          <p>© {new Date().getFullYear()} {agencyName(site, locale)}. {t("site.footer.rights")}</p>
          <a href="/admin" className="hover:text-white">{t("site.footer.staff")}</a>
        </div>
      </div>
    </footer>
  );
}

/** Sticky bottom bar on phones: the two actions that matter. */
export function MobileCtaBar({ site }: { site: PublicSite }) {
  const { t, locale } = useI18n();
  const { pathname } = useLocation();
  if (pathname.endsWith("/thank-you")) return null;
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[var(--line)] p-3 flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <WhatsAppLink site={site} className="flex-1 h-11" />
      {site.phone ? (
        <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="btn btn-secondary h-11 px-4">
          <Phone className="size-4" />
          {t("site.cta.call")}
        </a>
      ) : (
        <Link to={`/${locale}/contact`} className={cn("btn btn-primary h-11", site.whatsappNumber ? "px-4" : "flex-1")}>
          {t("site.cta.callback")}
        </Link>
      )}
    </div>
  );
}

export function PackageCover({ pkg, className }: { pkg: PublicPackage; className?: string }) {
  const { t, locale } = useI18n();
  return (
    <div className={cn("relative overflow-hidden bg-brand-700", className)}>
      {pkg.coverImage ? (
        <>
          <img src={pkg.coverImage} alt={pkgName(pkg, locale)} loading="lazy" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-950/55 to-transparent" aria-hidden="true" />
        </>
      ) : (
        // No photo yet: the brand illustration stands in for it.
        <KaabaScene className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.04]" />
      )}
      <div className="absolute top-3 start-3 flex gap-1.5">
        <span className="badge bg-white/95 text-brand-800">{t(`site.packages.${pkg.category}`)}</span>
        {pkg.isDemo && <span className="badge tone-demo">{t("site.packages.demo")}</span>}
      </div>
    </div>
  );
}

/** "700 m" / "1.2 km" in the visitor's language. */
export function useDistance() {
  const { t } = useI18n();
  return (metres: number) =>
    metres >= 1000 ? t("site.packages.km", { n: (metres / 1000).toFixed(1).replace(/\.0$/, "") }) : t("site.packages.metres", { n: metres });
}

/**
 * Package card. Information order: cover with flight type, location chips
 * (area, distance and walking time to the Haram), title, next departure,
 * duration and city, hotel, airline, "price starts from", actions.
 */
export function PackageCard({ pkg, site }: { pkg: PublicPackage; site: PublicSite }) {
  const { t, locale, isRtl } = useI18n();
  const distance = useDistance();
  const next = pkg.departures[0];
  const price = fromPrice(pkg);
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const title = pkgName(pkg, locale);
  const href = `/${locale}/packages/${pkg.slug}`;
  const chips = [
    pkg.makkahArea && { icon: MapPin, text: pkg.makkahArea },
    pkg.haramDistanceM != null && { icon: Navigation, text: distance(pkg.haramDistanceM) },
    pkg.walkMinutes && { icon: Footprints, text: t("site.packages.walk", { n: pkg.walkMinutes }) },
  ].filter(Boolean) as Array<{ icon: typeof MapPin; text: string }>;

  return (
    <article className="group flex flex-col rounded-2xl border border-[var(--line)] bg-white overflow-hidden transition-shadow hover:shadow-lift">
      <Link to={href} className="relative block" aria-label={title}>
        <PackageCover pkg={pkg} className="h-44" />
        {pkg.directFlight != null && (
          <span className={cn("absolute bottom-3 start-3 badge gap-1.5 px-2.5 py-1 text-xs", pkg.directFlight ? "bg-saffron text-ink" : "bg-white/95 text-petrol")}>
            <Plane className="size-3.5" />
            {pkg.directFlight ? t("site.packages.direct") : t("site.packages.indirect")}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        {chips.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-1.5">
            {chips.map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-1 rounded-full bg-stone px-2.5 py-1 text-[12px] font-medium text-petrol">
                <Icon className="size-3.5" />
                {text}
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-lg font-bold leading-snug">
          <Link to={href} className="hover:text-brand-500">{title}</Link>
        </h3>

        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <CalendarDays className="size-4 text-petrol" />
          {next ? <span className="font-semibold">{formatDate(next.departDate, locale, "long")}</span> : <span className="muted">{t("site.packages.datesSoon")}</span>}
          {next && next.seatsLeft <= 10 && (
            <span className={cn("badge ms-auto", next.seatsLeft > 0 ? "tone-amber" : "tone-rose")}>
              {next.seatsLeft > 0 ? t("site.packages.seatsLeft", { n: next.seatsLeft }) : t("site.packages.full")}
            </span>
          )}
        </p>

        <ul className="mt-2 grid gap-1.5 text-[13px] muted">
          {(pkg.durationDays || pkg.departureCity) && (
            <li className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" />
              {[pkg.durationDays ? t("site.packages.days", { n: pkg.durationDays }) : null, pkg.departureCity].filter(Boolean).join(" • ")}
            </li>
          )}
          {pkg.makkahHotel && (
            <li className="flex items-center gap-1.5 min-w-0">
              <Hotel className="size-3.5 shrink-0" />
              <span className="truncate">{pkg.makkahHotel}{pkg.hotelCategory ? ` · ${pkg.hotelCategory}` : ""}</span>
            </li>
          )}
          {pkg.airline && (
            <li className="flex items-center gap-1.5 min-w-0">
              <Plane className="size-3.5 shrink-0" />
              <span className="truncate">{pkg.airline}</span>
            </li>
          )}
        </ul>

        <div className="mt-auto pt-5 flex items-end justify-between gap-3 border-t border-[var(--line)] mt-5">
          <div>
            {price != null ? (
              <>
                <p className="text-xs muted">{t("site.packages.startsFrom")}</p>
                <p className="text-xl font-bold text-petrol tabular">{formatDzd(price, locale)}</p>
                <p className="text-[11px] muted">{t("site.packages.perPerson")}</p>
              </>
            ) : (
              <p className="text-sm font-semibold">{t("site.packages.priceOnRequest")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WhatsAppLink site={site} pkg={{ refCode: pkg.refCode, title }} className="btn-sm px-2.5">
              <span className="sr-only">{t("site.cta.whatsapp")}</span>
            </WhatsAppLink>
            <Link to={href} className="btn btn-primary btn-sm">
              {t("site.packages.details")}
              <Arrow className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, center }: { eyebrow?: string; title: string; subtitle?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <p className="eyebrow text-brand-600">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-3 text-base muted leading-relaxed">{subtitle}</p>}
    </div>
  );
}

/** Contact form. Posts to the server, which creates (or updates) the lead in the CRM. */
export function LeadForm({ packages, defaultSlug, compact }: { packages: PublicPackage[]; defaultSlug?: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const next: Record<string, string> = {};
    if (name.length < 2) next.name = t("site.form.errName");
    if (phone.replace(/\D/g, "").length < 8) next.phone = t("site.form.errPhone");
    if (!form.get("consent")) next.consent = t("site.form.errConsent");
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const utm = readUtm();
      const response = await fetch("/api/public/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          packageSlug: String(form.get("packageSlug") ?? "") || null,
          serviceType: String(form.get("serviceType") ?? "unknown"),
          adults: Number(form.get("adults") ?? 1),
          children: Number(form.get("children") ?? 0),
          message: String(form.get("message") ?? ""),
          consent: true,
          website: String(form.get("website") ?? ""),
          utmSource: utm.source,
          utmCampaign: utm.campaign,
        }),
      });
      if (response.ok) {
        navigate(`/${locale}/thank-you`);
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 429) setErrors({ form: t("site.form.errRate") });
      else if (body?.details?.field === "phone") setErrors({ phone: t("site.form.errPhone") });
      else if (body?.details?.field === "name") setErrors({ name: t("site.form.errName") });
      else setErrors({ form: t("site.form.errGeneric") });
    } catch {
      setErrors({ form: t("site.form.errGeneric") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
        <div>
          <label className="field-label" htmlFor="lf-name">{t("site.form.name")}</label>
          <input id="lf-name" name="name" className="input h-11" autoComplete="name" aria-invalid={!!errors.name} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="lf-phone">{t("site.form.phone")}</label>
          <input id="lf-phone" name="phone" type="tel" dir="ltr" inputMode="tel" className="input h-11" autoComplete="tel" placeholder="0661 23 45 67" aria-invalid={!!errors.phone} />
          {errors.phone ? <p className="field-error">{errors.phone}</p> : <p className="field-hint">{t("site.form.phoneHint")}</p>}
        </div>
      </div>

      {defaultSlug ? (
        <input type="hidden" name="packageSlug" value={defaultSlug} />
      ) : (
        <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
          <div>
            <label className="field-label" htmlFor="lf-service">{t("site.form.service")}</label>
            <select id="lf-service" name="serviceType" className="input h-11" defaultValue="umrah">
              <option value="umrah">{t("site.packages.umrah")}</option>
              <option value="hajj">{t("site.packages.hajj")}</option>
              <option value="unknown">{t("site.form.anyPackage")}</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="lf-package">{t("site.form.package")}</label>
            <select id="lf-package" name="packageSlug" className="input h-11" defaultValue="">
              <option value="">{t("site.form.anyPackage")}</option>
              {packages.map((p) => (
                <option key={p.id} value={p.slug}>{pkgName(p, locale)}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="field-label" htmlFor="lf-adults">{t("site.form.adults")}</label>
          <input id="lf-adults" name="adults" type="number" min={1} max={50} defaultValue={1} className="input h-11" />
        </div>
        <div>
          <label className="field-label" htmlFor="lf-children">{t("site.form.children")}</label>
          <input id="lf-children" name="children" type="number" min={0} max={50} defaultValue={0} className="input h-11" />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="lf-message">{t("site.form.message")}</label>
        <textarea id="lf-message" name="message" rows={3} maxLength={1000} className="input" placeholder={t("site.form.messagePh")} />
      </div>

      {/* Honeypot: hidden from people, tempting for bots */}
      <div className="hidden" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            {t("site.form.consent")}{" "}
            <Link to={`/${locale}/privacy`} className="text-brand-700 underline underline-offset-2">{t("site.form.privacy")}</Link>
          </span>
        </label>
        {errors.consent && <p className="field-error">{errors.consent}</p>}
      </div>

      {errors.form && (
        <p role="alert" className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2.5">{errors.form}</p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary btn-lg">
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />}
        {busy ? t("site.form.sending") : t("site.form.submit")}
      </button>
    </form>
  );
}
