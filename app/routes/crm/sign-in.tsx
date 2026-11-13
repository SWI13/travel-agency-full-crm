import { useState, type FormEvent } from "react";
import { redirect } from "react-router";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Route } from "./+types/sign-in";
import { useI18n } from "~/i18n";
import { ensureBootstrap, getUser } from "~/server/session.server";
import { getStore } from "~/server/store/index.server";
import { Field, Spinner } from "~/ui";

export async function loader({ request }: Route.LoaderArgs) {
  await ensureBootstrap();
  if (await getUser(request)) throw redirect("/admin");
  const needsSetup = (await getStore().list("staff", { limit: 1 })).length === 0;
  return { needsSetup };
}

export function meta() {
  return [{ title: "Sign in — CRM" }, { name: "robots", content: "noindex, nofollow" }];
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const { t, locale, isRtl } = useI18n();
  const { needsSetup } = loaderData;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Back = isRtl ? ArrowRight : ArrowLeft;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CRM-Request": "1" },
        body: JSON.stringify({
          setup: needsSetup || undefined,
          name: form.get("name") ?? undefined,
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (response.ok) {
        window.location.assign("/admin");
        return;
      }
      const body = await response.json().catch(() => null);
      setError(
        response.status === 429
          ? t("crm.errors.too_many_requests")
          : response.status === 401
            ? t("crm.auth.invalid")
            : (body?.message ?? t("crm.errors.server_error")),
      );
    } catch {
      setError(t("crm.errors.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="theme-crm min-h-dvh grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between bg-petrol text-white p-12 overflow-hidden">
        <img src="/brand/logo-horizontal-reversed.svg" alt="YourTour" className="h-14 w-auto self-start" draggable={false} />
        <div className="max-w-md">
          <p className="font-display text-4xl leading-tight font-medium">{t("crm.leads.subtitle")}</p>
          <p className="mt-6 flex items-start gap-3 text-sm text-brand-200">
            <ShieldCheck className="size-5 text-saffron shrink-0" />
            {t("crm.auth.secure")}
          </p>
        </div>
        <div className="h-px bg-[repeating-linear-gradient(90deg,var(--color-saffron)_0_6px,transparent_6px_16px)] opacity-70" aria-hidden="true" />
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <span className="inline-grid place-items-center size-11 rounded-2xl bg-emerald-50 text-emerald-700">
            <LockKeyhole className="size-5" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">{needsSetup ? t("crm.auth.setupTitle") : t("crm.auth.title")}</h1>
          <p className="mt-2 text-sm muted">{needsSetup ? t("crm.auth.setupBody") : t("crm.auth.subtitle")}</p>

          <form onSubmit={submit} className="mt-8 grid gap-4">
            {needsSetup && (
              <Field label={t("crm.auth.name")}>
                <input name="name" required minLength={2} maxLength={120} autoComplete="name" className="input h-11" />
              </Field>
            )}
            <Field label={t("crm.auth.email")}>
              <input name="email" type="email" required autoComplete="username" dir="ltr" className="input h-11" />
            </Field>
            <Field label={t("crm.auth.password")} hint={needsSetup ? t("crm.auth.passwordHint") : undefined}>
              <input name="password" type="password" required minLength={needsSetup ? 10 : 1} autoComplete={needsSetup ? "new-password" : "current-password"} dir="ltr" className="input h-11" />
            </Field>
            {error && <p role="alert" className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2.5">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-1">
              {busy && <Spinner />}
              {needsSetup ? t("crm.auth.setupSubmit") : busy ? t("crm.auth.submitting") : t("crm.auth.submit")}
            </button>
          </form>

          <a href={`/${locale}`} className="mt-8 inline-flex items-center gap-1.5 text-sm muted hover:text-navy-900">
            <Back className="size-4" />
            {t("crm.auth.backToSite")}
          </a>
        </div>
      </section>
    </main>
  );
}
