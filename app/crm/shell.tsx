import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { displayLogin } from "~/lib/login";
import { Link, NavLink, useLocation, useNavigate, useRevalidator } from "react-router";
import {
  Bell,
  BellRing,
  BookUser,
  CalendarClock,
  ChartNoAxesCombined,
  ExternalLink,
  KeyRound,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package as PackageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PlaneTakeoff,
  Plug,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  UsersRound,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "~/i18n";
import { LOCALES, type Locale } from "~/lib/constants";
import { cn, formatDzd, leadName, timeAgo } from "~/lib/format";
import type { Capability } from "~/lib/permissions";
import { formatPhone } from "~/lib/phone";
import { Avatar, Badge, DemoBadge, Field, Modal, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { DemoRunningControls, StartDemoButton } from "./demo-controls";
import { useCrm } from "./store";

const LOCALE_LABEL: Record<Locale, string> = { fr: "Français", ar: "العربية", en: "English" };

interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  cap?: Capability;
  end?: boolean;
}
const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "groupSales",
    items: [
      { to: "/admin", key: "overview", icon: LayoutDashboard, end: true },
      { to: "/admin/leads", key: "leads", icon: MessageCircle },
      { to: "/admin/follow-ups", key: "followups", icon: CalendarClock },
    ],
  },
  {
    group: "groupOps",
    items: [
      { to: "/admin/packages", key: "packages", icon: PackageIcon },
      { to: "/admin/departures", key: "departures", icon: PlaneTakeoff },
      { to: "/admin/bookings", key: "bookings", icon: BookUser },
    ],
  },
  {
    group: "groupAdmin",
    items: [
      { to: "/admin/team", key: "team", icon: UsersRound, cap: "team.view" },
      { to: "/admin/analytics", key: "analytics", icon: ChartNoAxesCombined, cap: "reports.view" },
      { to: "/admin/activity", key: "activity", icon: ScrollText },
      { to: "/admin/integrations", key: "integrations", icon: Plug, cap: "integrations.manage" },
      { to: "/admin/settings", key: "settings", icon: SettingsIcon },
    ],
  },
];

function GoldMark() {
  return <img src="/brand/mark-reversed.svg" alt="" aria-hidden="true" className="h-9 w-auto shrink-0 select-none" draggable={false} />;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { data, can, connection } = useCrm();
  const unread = data.leads.filter((l) => l.unreadCount > 0).length;
  const now = Date.now();
  const overdue = data.followups.filter((f) => f.status === "pending" && new Date(f.dueAt).getTime() < now).length;
  const counts: Record<string, { n: number; tone: string }> = {
    leads: { n: unread, tone: "bg-emerald-500 text-white" },
    followups: { n: overdue, tone: "bg-rose-500 text-white" },
  };
  const narrow = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-navy-950/50 lg:hidden animate-fade-in" onClick={onMobileClose} aria-hidden="true" />}
      <aside
        className={cn(
          "fixed lg:sticky top-0 z-50 h-dvh shrink-0 flex flex-col bg-petrol text-brand-100 transition-[width,transform] duration-200",
          narrow ? "lg:w-[76px]" : "lg:w-[264px]",
          "w-[272px] start-0",
          mobileOpen ? "translate-x-0" : "max-lg:-translate-x-full max-lg:rtl:translate-x-full",
        )}
      >
        <div className={cn("flex items-center gap-3 h-16 px-4 border-b border-white/[0.07]", narrow && "lg:justify-center lg:px-0")}>
          <GoldMark />
          <div className={cn("min-w-0", narrow && "lg:hidden")}>
            <p className="font-display text-[15px] font-semibold text-white truncate leading-tight">{data.settings.agencyName}</p>
            <p className="text-[11px] text-brand-200 truncate">{t("crm.app.name")}</p>
          </div>
          <button type="button" className="ms-auto text-navy-300 hover:text-white lg:hidden" onClick={onMobileClose} aria-label={t("crm.common.close")}>
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4 grid gap-5 content-start">
          {NAV.map(({ group, items }) => {
            const visible = items.filter((item) => !item.cap || can(item.cap));
            if (!visible.length) return null;
            return (
              <div key={group}>
                <p className={cn("px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300", narrow && "lg:hidden", locale === "ar" && "tracking-normal text-[11px]")}>
                  {t(`crm.nav.${group}`)}
                </p>
                <ul className="grid gap-0.5">
                  {visible.map(({ to, key, icon: Icon, end }) => {
                    const count = counts[key];
                    return (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={end}
                          onClick={onMobileClose}
                          title={narrow ? t(`crm.nav.${key}`) : undefined}
                          className={({ isActive }) =>
                            cn(
                              "group relative flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-colors",
                              narrow && "lg:justify-center lg:px-0",
                              isActive ? "bg-white/[0.09] text-white" : "hover:bg-white/[0.05] hover:text-white",
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && <span className="absolute start-0 inset-y-2 w-[3px] rounded-full bg-saffron" aria-hidden="true" />}
                              <Icon className={cn("size-[18px] shrink-0", isActive ? "text-saffron" : "text-brand-200 group-hover:text-white")} />
                              <span className={cn("truncate", narrow && "lg:hidden")}>{t(`crm.nav.${key}`)}</span>
                              {count && count.n > 0 && (
                                <span className={cn("ms-auto tabular text-[11px] font-bold px-1.5 min-w-5 h-5 grid place-items-center rounded-full", count.tone, narrow && "lg:absolute lg:top-1 lg:end-2 lg:ms-0 lg:h-4 lg:min-w-4 lg:text-[10px]")}>
                                  {count.n}
                                </span>
                              )}
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.07] p-3 grid gap-1">
          <a href={`/${locale}`} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] hover:bg-white/[0.05] hover:text-white", narrow && "lg:justify-center lg:px-0")} title={t("crm.nav.website")}>
            <ExternalLink className="size-4 shrink-0 text-navy-300" />
            <span className={cn(narrow && "lg:hidden")}>{t("crm.nav.website")}</span>
          </a>
          <div className={cn("flex items-center gap-3 h-9 px-3 text-[12px]", narrow && "lg:justify-center lg:px-0")}>
            <span className={cn("size-2 rounded-full shrink-0", connection === "live" ? "bg-emerald-400" : "bg-amber-400 animate-pulse")} />
            <span className={cn("text-navy-300", narrow && "lg:hidden")}>{connection === "live" ? t("crm.top.live") : t("crm.top.reconnecting")}</span>
            <button type="button" onClick={onToggle} className={cn("hidden lg:grid ms-auto place-items-center size-7 rounded-md text-navy-300 hover:text-white hover:bg-white/[0.07]", narrow && "lg:ms-0 lg:hidden")} aria-label={t("crm.nav.collapse")}>
              <PanelLeftClose className="size-4 rtl:-scale-x-100" />
            </button>
          </div>
          {narrow && (
            <button type="button" onClick={onToggle} className="hidden lg:grid place-items-center h-9 rounded-lg text-navy-300 hover:text-white hover:bg-white/[0.07]" aria-label={t("crm.nav.expand")}>
              <PanelLeftOpen className="size-4 rtl:-scale-x-100" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

/** Closes a popover when clicking outside or pressing Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const POPOVER = "absolute top-full mt-2 z-50 rounded-xl bg-white border border-[var(--line)] shadow-lift animate-pop";

function GlobalSearch() {
  const { t, locale } = useI18n();
  const { data, openLead, packageById } = useCrm();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const digits = q.replace(/\D/g, "");
    const leads = data.leads
      .filter((l) => leadName(l).toLowerCase().includes(q) || (l.waName ?? "").toLowerCase().includes(q) || (digits.length >= 3 && (l.phone ?? "").replace(/\D/g, "").includes(digits)))
      .slice(0, 6);
    const packages = data.packages.filter((p) => `${p.name} ${p.nameAr ?? ""} ${p.refCode}`.toLowerCase().includes(q)).slice(0, 4);
    const bookings = data.bookings.filter((b) => b.customerName.toLowerCase().includes(q)).slice(0, 4);
    return { leads, packages, bookings, empty: !leads.length && !packages.length && !bookings.length };
  }, [query, data.leads, data.packages, data.bookings]);

  const go = (action: () => void) => {
    action();
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} className="relative flex-1 max-w-xl">
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-navy-400 pointer-events-none" />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("crm.top.searchPlaceholder")}
        aria-label={t("crm.top.searchPlaceholder")}
        className="input ps-9 h-10 bg-white/70"
      />
      {open && results && (
        <div className={cn(POPOVER, "inset-x-0 max-h-[70dvh] overflow-y-auto scroll-thin p-2")}>
          {results.empty && <p className="px-3 py-6 text-center text-sm muted">{t("crm.top.noMatches")}</p>}
          {results.leads.length > 0 && <p className="eyebrow px-3 pt-2 pb-1">{t("crm.top.groupLeads")}</p>}
          {results.leads.map((lead) => (
            <button key={lead.id} type="button" onClick={() => go(() => openLead(lead.id))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-start hover:bg-sand-100">
              <Avatar name={leadName(lead)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate">{leadName(lead)}</span>
                <span className="block text-xs muted ltr-inline">{formatPhone(lead.phone)}</span>
              </span>
              <Badge tone="neutral">{t(`crm.stage.${lead.stage}`)}</Badge>
            </button>
          ))}
          {results.packages.length > 0 && <p className="eyebrow px-3 pt-3 pb-1">{t("crm.top.groupPackages")}</p>}
          {results.packages.map((pkg) => (
            <button key={pkg.id} type="button" onClick={() => go(() => navigate("/admin/packages"))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-start hover:bg-sand-100">
              <PackageIcon className="size-4 text-navy-400 shrink-0" />
              <span className="text-sm font-medium truncate flex-1">{pkg.name}</span>
              <span className="text-xs muted tabular">{formatDzd(pkg.priceDzd, locale)}</span>
            </button>
          ))}
          {results.bookings.length > 0 && <p className="eyebrow px-3 pt-3 pb-1">{t("crm.top.groupBookings")}</p>}
          {results.bookings.map((booking) => (
            <button key={booking.id} type="button" onClick={() => go(() => navigate("/admin/bookings"))} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-start hover:bg-sand-100">
              <BookUser className="size-4 text-navy-400 shrink-0" />
              <span className="text-sm font-medium truncate flex-1">{booking.customerName}</span>
              <span className="text-xs muted truncate max-w-40">{packageById.get(booking.packageId)?.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageMenu() {
  const { t, locale } = useI18n();
  const { open, setOpen, ref } = usePopover();
  const revalidator = useRevalidator();
  const choose = (next: Locale) => {
    document.cookie = `crm_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setOpen(false);
    void revalidator.revalidate(); // re-reads the cookie: <html lang dir> and all text switch together
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" className="icon-btn" onClick={() => setOpen(!open)} aria-label={t("crm.top.language")} aria-expanded={open} title={t("crm.top.language")}>
        <Languages className="size-5" />
      </button>
      {open && (
        <div className={cn(POPOVER, "end-0 w-44 p-1.5")} role="menu">
          {LOCALES.map((l) => (
            <button key={l} type="button" role="menuitemradio" aria-checked={l === locale} lang={l} onClick={() => choose(l)} className={cn("w-full flex items-center justify-between px-3 h-9 rounded-lg text-sm hover:bg-sand-100", l === locale && "font-semibold text-emerald-700")}>
              {LOCALE_LABEL[l]}
              <span className="text-[11px] uppercase muted">{l}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsMenu() {
  const { t, locale } = useI18n();
  const { notices, markNoticesRead, openLead, data } = useCrm();
  const { open, setOpen, ref } = usePopover();
  const unreadNotices = notices.filter((n) => !n.read).length;
  const unreadLeads = data.leads.filter((l) => l.unreadCount > 0).length;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="icon-btn relative"
        aria-label={t("crm.top.notifications")}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (open) markNoticesRead();
        }}
      >
        {unreadNotices > 0 ? <BellRing className="size-5 text-emerald-700" /> : <Bell className="size-5" />}
        {unreadNotices > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-emerald-500 text-white text-[10px] font-bold tabular ring-2 ring-[var(--canvas)]">
            {unreadNotices}
          </span>
        )}
      </button>
      {open && (
        <div className={cn(POPOVER, "end-0 w-[22rem] max-w-[calc(100vw-2rem)]")}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
            <p className="font-semibold text-sm">{t("crm.top.notifications")}</p>
            {unreadNotices > 0 && (
              <button type="button" className="text-xs font-semibold text-emerald-700 hover:underline" onClick={markNoticesRead}>
                {t("crm.top.markAllRead")}
              </button>
            )}
          </div>
          {unreadLeads > 0 && (
            <Link to="/admin/leads" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
              <MessageCircle className="size-4" />
              {t("crm.top.unreadLeads", { n: unreadLeads })}
            </Link>
          )}
          <ul className="max-h-80 overflow-y-auto scroll-thin">
            {notices.length === 0 && <li className="px-4 py-8 text-center text-sm muted">{t("crm.top.noNotifications")}</li>}
            {notices.map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  className="w-full flex gap-3 px-4 py-3 text-start hover:bg-sand-100 border-b border-[var(--line)] last:border-0"
                  onClick={() => {
                    openLead(notice.leadId);
                    setOpen(false);
                    markNoticesRead();
                  }}
                >
                  <span className={cn("mt-1.5 size-2 rounded-full shrink-0", notice.read ? "bg-navy-200" : "bg-emerald-500")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{notice.title}</span>
                    <span className="block text-[13px] muted truncate">{notice.body}</span>
                    <span className="block text-[11px] muted mt-0.5">{timeAgo(notice.at, locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("account.changePassword", { current: form.get("current"), next: form.get("next") });
      toast.success(t("crm.auth.passwordChanged"));
      onClose();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("crm.auth.changePassword")} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <Field label={t("crm.auth.currentPassword")}>
          <input name="current" type="password" required autoComplete="current-password" className="input" />
        </Field>
        <Field label={t("crm.auth.newPassword")} hint={t("crm.auth.passwordHint")} error={error}>
          <input name="next" type="password" required minLength={10} autoComplete="new-password" className="input" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {t("crm.common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProfileMenu() {
  const { t } = useI18n();
  const { data } = useCrm();
  const { open, setOpen, ref } = usePopover();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE", headers: { "X-CRM-Request": "1" } }).catch(() => {});
    window.location.assign("/admin/sign-in");
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" className="flex items-center gap-2 rounded-full ps-1 pe-1 sm:pe-3 h-10 hover:bg-navy-900/[0.05]" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Avatar name={data.me.name} />
        <span className="hidden sm:block text-start leading-tight">
          <span className="block text-[13px] font-semibold max-w-32 truncate">{data.me.name}</span>
          <span className="block text-[11px] muted">{t(`crm.role.${data.me.role}`)}</span>
        </span>
      </button>
      {open && (
        <div className={cn(POPOVER, "end-0 w-60 p-1.5")} role="menu">
          <div className="px-3 py-2 border-b border-[var(--line)] mb-1">
            <p className="text-sm font-semibold truncate">{data.me.name}</p>
            <p className="text-xs muted truncate ltr-inline">{displayLogin(data.me.email)}</p>
          </div>
          <button type="button" role="menuitem" className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm hover:bg-sand-100" onClick={() => { setPasswordOpen(true); setOpen(false); }}>
            <KeyRound className="size-4 text-navy-400" />
            {t("crm.auth.changePassword")}
          </button>
          <button type="button" role="menuitem" className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-rose-700 hover:bg-rose-50" onClick={signOut}>
            <LogOut className="size-4 rtl:-scale-x-100" />
            {t("crm.auth.signOut")}
          </button>
        </div>
      )}
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  const { sound, setSound } = useCrm();
  return (
    <header className="sticky top-0 z-30 h-16 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] backdrop-blur border-b border-[var(--line)]">
      <button type="button" className="icon-btn lg:hidden" onClick={onMenu} aria-label={t("crm.nav.menu")}>
        <Menu className="size-5" />
      </button>
      <GlobalSearch />
      <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
        <StartDemoButton />
        <button type="button" className="icon-btn" onClick={() => setSound(!sound)} aria-pressed={sound} aria-label={sound ? t("crm.top.soundOn") : t("crm.top.soundOff")} title={sound ? t("crm.top.soundOn") : t("crm.top.soundOff")}>
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <LanguageMenu />
        <NotificationsMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}

/** Makes sample data and the demo datastore impossible to miss. */
export function DemoBanner() {
  const { t } = useI18n();
  const { data, can } = useCrm();
  const hasDemo = data.leads.some((l) => l.isDemo) || data.packages.some((p) => p.isDemo);
  const local = data.server.driver === "local";
  const { pathname } = useLocation();
  if (!hasDemo && !local) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6 py-2 text-[13px] bg-fuchsia-50 text-fuchsia-900 border-b border-fuchsia-200">
      {hasDemo && (
        <span className="flex items-center gap-2">
          <DemoBadge show />
          {t("crm.demo.banner")}
        </span>
      )}
      {local && can("integrations.manage") && <span className="opacity-80">{t("crm.demo.localStore")}</span>}
      <span className="ms-auto flex flex-wrap items-center gap-3">
        <DemoRunningControls />
        {can("integrations.manage") && pathname !== "/admin/integrations" && (
          <Link to="/admin/integrations" className="font-semibold underline underline-offset-2">{t("crm.demo.manage")}</Link>
        )}
      </span>
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1500px] w-full mx-auto">{children}</div>;
}
