import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Copy,
  Database,
  FlaskConical,
  Play,
  Plug,
  RefreshCw,
  Smartphone,
  TriangleAlert,
  Webhook,
} from "lucide-react";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { cn, formatDateTime, timeAgo } from "~/lib/format";
import { WhatsAppIcon } from "~/site/components";
import { Badge, EmptyState, PageHeader, SkeletonRows, Spinner } from "~/ui";
import { useConfirm, useToast } from "~/ui/feedback";

interface Status {
  connection: "not_connected" | "configured" | "connected" | "error";
  config: { present: Record<string, boolean>; missing: string[]; canReceive: boolean; canCallApi: boolean };
  webhookUrl: string;
  isPublicUrl: boolean;
  graphVersion: string;
  database: { driver: "local" | "appwrite"; ok: boolean; detail: string };
  demoTools: boolean;
  hasDemoData: boolean;
  demoSeedLoaded: boolean;
  state: {
    webhookVerifiedAt: string | null;
    lastWebhookAt: string | null;
    lastRealEventAt: string | null;
    lastDemoEventAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    lastTestAt: string | null;
    lastTestOk: boolean | null;
    lastTestDetail: Record<string, unknown> | null;
  };
  recentEvents: Array<{ id: string; createdAt: string; status: string; summary: string | null; error: string | null; isDemo: boolean }>;
}

const SCENARIOS = [
  "new_customer", "returning_customer", "no_profile_name", "ctwa_facebook", "ctwa_instagram",
  "website_ref", "duplicate", "burst", "staff_reply", "username_only",
] as const;

const STATE_STYLE = {
  not_connected: { tone: "neutral", icon: CircleDashed, ring: "bg-navy-100 text-navy-500" },
  configured: { tone: "amber", icon: TriangleAlert, ring: "bg-amber-50 text-amber-600" },
  connected: { tone: "emerald", icon: CircleCheck, ring: "bg-emerald-50 text-emerald-600" },
  error: { tone: "rose", icon: CircleAlert, ring: "bg-rose-50 text-rose-600" },
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--line)] last:border-0 text-sm">
      <dt className="muted shrink-0">{label}</dt>
      <dd className="font-medium text-end min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default function IntegrationsPage() {
  const { t, locale } = useI18n();
  const { can, reload } = useCrm();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<Status>("integrations.status"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!can("integrations.manage")) return <PageBody><EmptyState icon={Plug} title={t("crm.errors.forbidden")} /></PageBody>;

  const when = (iso: string | null) => (iso ? `${formatDateTime(iso, locale)} · ${timeAgo(iso, locale)}` : t("crm.common.never"));
  const i = "crm.integrations";

  const test = async () => {
    setTesting(true);
    try {
      const result = await api<{ ok: boolean; detail: Record<string, unknown> }>("integrations.test");
      if (result.ok) toast.success(t(`${i}.testOk`));
      else toast.error(t(`${i}.testFail`), String(result.detail?.error === "missing_credentials" ? t(`${i}.testMissing`) : (result.detail?.error ?? "")));
      await refresh();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setTesting(false);
    }
  };

  const simulate = async (scenario: string) => {
    setRunning(scenario);
    try {
      const out = await api<{ results: Array<{ newLeads: number; messages: number; duplicates: number; status: string }>; note?: string }>("demo.simulate", { scenario });
      const sum = out.results.reduce(
        (acc, r) => ({ leads: acc.leads + r.newLeads, messages: acc.messages + r.messages, duplicates: acc.duplicates + r.duplicates + (r.status === "duplicate" ? 1 : 0) }),
        { leads: 0, messages: 0, duplicates: 0 },
      );
      setLastResult(`${t(`${i}.demo.scenario.${scenario}`)} — ${t(`${i}.demo.result`, sum)}${out.note ? ` (${out.note})` : ""}`);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setRunning(null);
    }
  };

  const demoData = async (load: boolean) => {
    if (!load && !(await confirm({ title: t(`${i}.demo.clear`), body: t(`${i}.demo.clearConfirm`), danger: true, confirmLabel: t(`${i}.demo.clear`) }))) return;
    setRunning(load ? "load" : "clear");
    try {
      await api(load ? "demo.load" : "demo.clear");
      await Promise.all([reload(), refresh()]);
      toast.success(t(load ? `${i}.demo.loaded` : `${i}.demo.cleared`));
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setRunning(null);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("crm.common.copied"));
    } catch {
      toast.error(t("crm.errors.server_error"));
    }
  };

  return (
    <PageBody>
      <PageHeader
        title={t(`${i}.title`)}
        subtitle={t(`${i}.subtitle`)}
        actions={<button type="button" className="btn btn-secondary" onClick={refresh}><RefreshCw className="size-4" />{t("crm.common.retry")}</button>}
      />

      {failed && <div className="panel"><EmptyState icon={CircleAlert} title={t("crm.common.loadError")} action={<button type="button" className="btn btn-primary" onClick={refresh}>{t("crm.common.retry")}</button>} /></div>}
      {!status && !failed && <div className="panel"><SkeletonRows rows={6} /></div>}

      {status && (() => {
        const style = STATE_STYLE[status.connection];
        const detail = status.state.lastTestDetail ?? {};
        const tested = status.state.lastTestOk === true;
        return (
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] items-start">
            <div className="grid gap-6">
              {/* Connection status */}
              <section className="panel p-6">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="grid place-items-center size-12 rounded-2xl bg-[#e7f6ee] text-whatsapp shrink-0"><WhatsAppIcon className="size-7" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-semibold">{t(`${i}.whatsapp`)}</h2>
                      <Badge tone={style.tone} dot>{t(`${i}.state.${status.connection}`)}</Badge>
                    </div>
                    <p className="mt-1 text-sm muted max-w-xl">{t(`${i}.stateHint.${status.connection}`)}</p>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={test} disabled={testing}>
                    {testing ? <Spinner /> : <Plug className="size-4" />}
                    {testing ? t(`${i}.testing`) : t(`${i}.test`)}
                  </button>
                </div>

                {status.state.lastTestOk === false && typeof detail.error === "string" && (
                  <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-rose-50 text-rose-800 text-sm px-4 py-3">
                    <CircleAlert className="size-4 mt-0.5 shrink-0" />
                    <span className="break-words min-w-0">{detail.error}</span>
                  </p>
                )}
                {!status.config.canCallApi && <p className="mt-4 rounded-xl bg-sand-100 text-sm px-4 py-3 muted">{t(`${i}.testMissing`)}</p>}

                <dl className="mt-5">
                  <Row label={t(`${i}.connectedNumber`)}>{tested && detail.displayPhoneNumber ? <span className="ltr-inline">{String(detail.displayPhoneNumber)}</span> : <span className="muted font-normal">{t(`${i}.notAvailable`)}</span>}</Row>
                  <Row label={t(`${i}.verifiedName`)}>{tested && detail.verifiedName ? String(detail.verifiedName) : <span className="muted font-normal">{t(`${i}.notAvailable`)}</span>}</Row>
                  <Row label={t(`${i}.businessAccount`)}>{tested && detail.businessAccountName ? String(detail.businessAccountName) : <span className="muted font-normal">{t(`${i}.notAvailable`)}</span>}</Row>
                  <Row label={t(`${i}.quality`)}>{tested && detail.qualityRating ? String(detail.qualityRating) : <span className="muted font-normal">{t(`${i}.notAvailable`)}</span>}</Row>
                  <Row label={t(`${i}.coexistence`)}>
                    {!tested ? <span className="muted font-normal">{t(`${i}.notAvailable`)}</span> : detail.isOnBizApp === true ? <span className="text-emerald-700">{t(`${i}.coexActive`)}</span> : <span className="muted font-normal">{t(`${i}.coexInactive`)}</span>}
                  </Row>
                  <Row label={t(`${i}.test`)}>{when(status.state.lastTestAt)}</Row>
                </dl>
              </section>

              {/* Webhook */}
              <section className="panel p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Webhook className="size-5 text-navy-400" />{t(`${i}.webhook`)}</h2>
                <label className="block mt-4">
                  <span className="field-label">{t(`${i}.webhookUrl`)}</span>
                  <span className="flex gap-2">
                    <input readOnly dir="ltr" value={status.webhookUrl} className="input font-mono text-[13px]" onFocus={(e) => e.target.select()} />
                    <button type="button" className="btn btn-secondary shrink-0" onClick={() => copy(status.webhookUrl)}><Copy className="size-4" />{t("crm.common.copy")}</button>
                  </span>
                  <span className="field-hint">{t(`${i}.webhookUrlHint`)}</span>
                </label>
                {!status.isPublicUrl && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 text-amber-800 text-[13px] px-4 py-3">
                    <TriangleAlert className="size-4 mt-0.5 shrink-0" />
                    {t(`${i}.localWarning`)}
                  </p>
                )}
                <dl className="mt-4">
                  <Row label={t(`${i}.handshake`)}>{when(status.state.webhookVerifiedAt)}</Row>
                  <Row label={t(`${i}.lastReal`)}>{when(status.state.lastRealEventAt)}</Row>
                  <Row label={t(`${i}.lastDemo`)}>{when(status.state.lastDemoEventAt)}</Row>
                  <Row label={t(`${i}.lastError`)}>
                    {status.state.lastError ? <span className="text-rose-700">{status.state.lastError}<span className="block text-xs font-normal muted">{when(status.state.lastErrorAt)}</span></span> : <span className="muted font-normal">{t("crm.common.none")}</span>}
                  </Row>
                </dl>

                <h3 className="eyebrow mt-6 mb-2">{t(`${i}.recentEvents`)}</h3>
                {status.recentEvents.length === 0 ? (
                  <p className="text-sm muted">{t(`${i}.noEvents`)}</p>
                ) : (
                  <ul className="grid gap-1.5">
                    {status.recentEvents.map((event) => (
                      <li key={event.id} className="flex items-center gap-2 text-[13px]">
                        <span className={cn("size-2 rounded-full shrink-0", event.status === "processed" ? "bg-emerald-500" : event.status === "failed" ? "bg-rose-500" : "bg-navy-300")} />
                        <span className="muted tabular whitespace-nowrap">{formatDateTime(event.createdAt, locale)}</span>
                        <span className="truncate">{event.error ?? event.summary ?? event.status}</span>
                        {event.isDemo && <Badge tone="demo" className="ms-auto">{t(`${i}.simulated`)}</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Demo & testing */}
              <section className="panel p-6 border-fuchsia-200">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><FlaskConical className="size-5 text-fuchsia-600" />{t(`${i}.demo.title`)}</h2>
                <p className="mt-1 text-sm muted">{status.demoTools ? t(`${i}.demo.subtitle`) : t(`${i}.demo.disabled`)}</p>
                {status.demoTools && (
                  <>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {SCENARIOS.map((scenario) => (
                        <li key={scenario}>
                          <button type="button" disabled={!!running} onClick={() => simulate(scenario)} className="w-full flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-start text-[13px] font-medium hover:border-fuchsia-300 hover:bg-fuchsia-50/50 disabled:opacity-60 transition-colors">
                            <span className="grid place-items-center size-7 rounded-lg bg-fuchsia-50 text-fuchsia-700 shrink-0">
                              {running === scenario ? <Spinner /> : <Play className="size-3.5" />}
                            </span>
                            {t(`${i}.demo.scenario.${scenario}`)}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {lastResult && <p role="status" className="mt-3 rounded-xl bg-fuchsia-50 text-fuchsia-900 text-[13px] px-4 py-2.5">{lastResult}</p>}
                  </>
                )}
                <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-wrap gap-2">
                  {status.demoTools && (
                    <button type="button" className="btn btn-secondary" disabled={!!running || status.demoSeedLoaded} onClick={() => demoData(true)}>
                      {running === "load" && <Spinner />}
                      {t(`${i}.demo.load`)}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost text-rose-700" disabled={!!running || !status.hasDemoData} onClick={() => demoData(false)}>
                    {running === "clear" && <Spinner />}
                    {t(`${i}.demo.clear`)}
                  </button>
                </div>
              </section>
            </div>

            <div className="grid gap-6">
              {/* Configuration checklist */}
              <section className="panel p-6">
                <h2 className="font-display text-lg font-semibold">{t(`${i}.config`)}</h2>
                <ul className="mt-3 grid gap-2">
                  {Object.entries(status.config.present).map(([name, present]) => (
                    <li key={name} className="flex items-center gap-2.5 text-[13px]">
                      {present ? <CircleCheck className="size-4 text-emerald-600 shrink-0" /> : <CircleDashed className="size-4 text-navy-300 shrink-0" />}
                      <code className="font-mono text-xs ltr-inline truncate">{name}</code>
                      <span className={cn("ms-auto text-xs font-semibold", present ? "text-emerald-700" : "muted")}>{present ? t(`${i}.set`) : t(`${i}.missing`)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs muted leading-relaxed">{t(`${i}.configHint`)}</p>
                <dl className="mt-4 pt-3 border-t border-[var(--line)]">
                  <Row label={t(`${i}.database`)}>
                    <span className="flex items-center justify-end gap-1.5">
                      <Database className="size-3.5 text-navy-400" />
                      {status.database.driver === "local" ? t(`${i}.driverLocal`) : t(`${i}.driverAppwrite`)}
                      <span className={cn("size-2 rounded-full", status.database.ok ? "bg-emerald-500" : "bg-rose-500")} title={status.database.detail} />
                    </span>
                  </Row>
                  {!status.database.ok && (
                    <p role="alert" className="py-2 text-[13px] text-rose-700 break-words">{status.database.detail}</p>
                  )}
                  <Row label="Graph API"><span className="ltr-inline font-mono text-xs">{status.graphVersion}</span></Row>
                </dl>
              </section>

              {/* Setup guide */}
              <section className="panel p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><BookOpen className="size-5 text-navy-400" />{t(`${i}.setup.title`)}</h2>
                <ol className="mt-3 grid gap-3">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <li key={n} className="grid grid-cols-[auto_1fr] gap-3 text-[13px] leading-relaxed">
                      <span className="grid place-items-center size-6 rounded-full bg-navy-900 text-white text-[11px] font-bold tabular">{n}</span>
                      <span>{t(`${i}.setup.s${n}`)}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-xs muted">{t(`${i}.setup.docs`)}</p>
              </section>

              {/* Coexistence */}
              <section className="panel p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Smartphone className="size-5 text-navy-400" />{t(`${i}.coex.title`)}</h2>
                <p className="mt-2 text-[13px] leading-relaxed">{t(`${i}.coex.p1`)}</p>
                <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed muted list-disc ps-5">
                  {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`${i}.coex.l${n}`)}</li>)}
                </ul>
              </section>
            </div>
          </div>
        );
      })()}
    </PageBody>
  );
}
