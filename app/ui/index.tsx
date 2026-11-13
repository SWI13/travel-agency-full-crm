import { useEffect, useId, useRef, type ReactNode } from "react";
import { LoaderCircle, X, type LucideIcon } from "lucide-react";
import { useI18n } from "~/i18n";
import { cn, initials } from "~/lib/format";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin", className)} aria-hidden="true" />;
}

export function Badge({ tone = "neutral", dot, className, children, title }: {
  tone?: string;
  dot?: boolean;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span title={title} className={cn("badge", `tone-${tone}`, dot && "badge-dot", className)}>
      {children}
    </span>
  );
}

/** Marks sample records so they are never mistaken for real customers. */
export function DemoBadge({ show }: { show: boolean | undefined }) {
  const { t } = useI18n();
  if (!show) return null;
  return <Badge tone="demo" title={t("crm.common.demoHint")}>{t("crm.common.demo")}</Badge>;
}

const AVATAR_TONES = [
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-gold-100 text-gold-600",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
];
export function Avatar({ name, size = "md", className }: { name: string | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const label = name ?? "";
  const tone = AVATAR_TONES[[...label].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  const dims = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-11 text-sm" : "size-8 text-xs";
  return (
    <span title={label} className={cn("inline-grid place-items-center rounded-full font-bold shrink-0", dims, label ? tone : "bg-navy-100 text-navy-400", className)}>
      {label ? initials(label) : "–"}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, hint, action, compact }: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center px-6", compact ? "py-8" : "py-16")}>
      <span className="grid place-items-center size-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon className="size-6" />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm muted max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm muted max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">{actions}</div>}
    </header>
  );
}

export function Field({ label, error, hint, children, className, optional }: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className={cn("block", className)}>
      <span className="field-label">
        {label}
        {optional && <span className="ms-1 font-normal muted">({t("crm.common.optional")})</span>}
      </span>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: LucideIcon; count?: number }>;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full overflow-x-auto rounded-lg p-0.5 bg-navy-900/[0.06] [scrollbar-width:none]", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-semibold whitespace-nowrap transition-all",
            value === option.value ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-900",
          )}
        >
          {option.icon && <option.icon className="size-3.5" />}
          {option.label}
          {option.count !== undefined && (
            <span className={cn("tabular text-[11px] px-1.5 rounded-full", value === option.value ? "bg-navy-900 text-white" : "bg-navy-900/10")}>
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** focusSelf: focus the panel itself (no form field), so phones do not pop the keyboard. */
function useOverlay(open: boolean, onClose: () => void, focusSelf = false) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept in a ref so re-renders (typing in a form) never re-run the focus logic.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    // Move focus into the dialog for keyboard and screen-reader users: an explicit target,
    // else the first form field, else the first button. No ring when opened with the mouse.
    const root = ref.current;
    const first = focusSelf
      ? root
      :
      root?.querySelector<HTMLElement>("[data-autofocus]") ??
      root?.querySelector<HTMLElement>("input:not([type=hidden]):not([readonly]), select, textarea") ??
      root?.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useI18n();
  const ref = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative w-full bg-white shadow-lift animate-pop flex flex-col max-h-[92dvh] rounded-t-2xl sm:rounded-2xl",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <header className="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-[var(--line)]">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-xl font-semibold text-navy-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn -me-2 -mt-1" onClick={onClose} aria-label={t("crm.common.close")}>
            <X className="size-5" />
          </button>
        </header>
        <div className="px-6 py-5 overflow-y-auto scroll-thin">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-[var(--line)] bg-sand-50 rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  );
}

/** Slide-over panel anchored to the inline end (right in LTR, left in RTL). */
export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useOverlay(open, onClose, true);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-navy-950/40 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="outline-none absolute inset-y-0 end-0 w-full sm:max-w-[600px] bg-[var(--canvas)] shadow-drawer flex flex-col animate-slide-in rtl:[--slide-from:-100%]"
      >
        {children}
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-3 p-5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton size-9 rounded-full" />
          <div className="flex-1 grid gap-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Thin progress bar used for seat occupancy and checklist readiness. */
export function Meter({ value, max, tone = "emerald", className }: { value: number; max: number; tone?: "emerald" | "amber" | "rose" | "gold"; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", gold: "bg-gold-400" }[tone];
  return (
    <div className={cn("h-1.5 rounded-full bg-navy-900/[0.08] overflow-hidden", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
