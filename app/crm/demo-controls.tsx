import { useState } from "react";
import { useNavigate } from "react-router";
import { MessageSquarePlus, Play, Square } from "lucide-react";
import { useI18n } from "~/i18n";
import { Spinner } from "~/ui";
import { useConfirm, useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { useCrm } from "./store";

/**
 * Presentation mode. "Start demo" fills the CRM and the website with a complete
 * sample agency (offers with photos, customers at every step, conversations,
 * bookings, follow-ups). During the demo a fake WhatsApp message can be sent at
 * any moment to show live notifications. "End demo" removes every sample record;
 * real data is never touched. Administrators only, and only when DEMO_TOOLS is on.
 */

const LIVE_SCENARIOS = ["ctwa_instagram", "new_customer", "ctwa_facebook", "website_ref", "returning_customer"] as const;

export function useDemoState() {
  const { data, can } = useCrm();
  const allowed = data.server.demoTools && can("demo.tools");
  const running = data.leads.some((l) => l.isDemo) || data.packages.some((p) => p.isDemo);
  return { allowed, running };
}

/** Top-bar button shown while no demo is running. */
export function StartDemoButton() {
  const { t } = useI18n();
  const { reload } = useCrm();
  const toast = useToast();
  const navigate = useNavigate();
  const { allowed, running } = useDemoState();
  const [busy, setBusy] = useState(false);
  if (!allowed || running) return null;

  const start = async () => {
    setBusy(true);
    try {
      await api("demo.load", {});
      await reload();
      toast.success(t("crm.demo.started"), t("crm.demo.startedBody"));
      navigate("/admin");
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={start} disabled={busy} className="btn btn-sm h-9 bg-fuchsia-600 text-white hover:bg-fuchsia-700 shadow-sm" title={t("crm.demo.startHint")}>
      {busy ? <Spinner /> : <Play className="size-4" />}
      <span className="hidden sm:inline">{busy ? t("crm.demo.starting") : t("crm.demo.start")}</span>
    </button>
  );
}

/** Buttons inside the purple banner while the demo runs. */
export function DemoRunningControls() {
  const { t } = useI18n();
  const { reload } = useCrm();
  const toast = useToast();
  const confirm = useConfirm();
  const { allowed, running } = useDemoState();
  const [busy, setBusy] = useState<"message" | "end" | null>(null);
  const [turn, setTurn] = useState(0);
  if (!allowed || !running) return null;

  const message = async () => {
    setBusy("message");
    try {
      // The new lead arrives through the real webhook pipeline: watch the notification and the board.
      await api("demo.simulate", { scenario: LIVE_SCENARIOS[turn % LIVE_SCENARIOS.length] });
      setTurn((n) => n + 1);
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(null);
    }
  };

  const end = async () => {
    if (!(await confirm({ title: t("crm.demo.endTitle"), body: t("crm.demo.endBody"), confirmLabel: t("crm.demo.end"), danger: true }))) return;
    setBusy("end");
    try {
      await api("demo.clear", {});
      await reload();
      toast.success(t("crm.demo.ended"));
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={message} disabled={busy !== null} className="btn btn-sm bg-white text-fuchsia-900 ring-1 ring-fuchsia-300 hover:bg-fuchsia-100">
        {busy === "message" ? <Spinner /> : <MessageSquarePlus className="size-4" />}
        {t("crm.demo.newMessage")}
      </button>
      <button type="button" onClick={end} disabled={busy !== null} className="btn btn-sm bg-fuchsia-700 text-white hover:bg-fuchsia-800">
        {busy === "end" ? <Spinner /> : <Square className="size-3.5" />}
        {t("crm.demo.end")}
      </button>
    </span>
  );
}
