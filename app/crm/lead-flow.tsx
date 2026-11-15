import { useState, type FormEvent } from "react";
import { Search, Users } from "lucide-react";
import { useI18n } from "~/i18n";
import { leadName } from "~/lib/format";
import { formatPhone } from "~/lib/phone";
import type { Lead, Package } from "~/lib/types";
import { Avatar, Modal } from "~/ui";
import { useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { useCrm } from "./store";

/** Small shared pieces of the sales flow. The main path lives in assign-trip.tsx. */

// ── Not interested ──────────────────────────────────────────────────────────
const LOST_REASONS = ["price", "other_agency", "dates", "no_answer", "later"] as const;

export function LostModal({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { apply } = useCrm();
  const toast = useToast();
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (reason: string) => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      apply("leads", await api<Lead>("leads.update", { id: lead.id, patch: { stage: "lost", lostReason: reason.trim() } }));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t("crm.flow.lostTitle", { name: leadName(lead) })}>
      <div className="grid gap-2">
        {LOST_REASONS.map((r) => (
          <button key={r} type="button" disabled={busy} className="btn btn-secondary justify-start h-11" onClick={() => save(t(`crm.flow.lostReasons.${r}`))}>
            {t(`crm.flow.lostReasons.${r}`)}
          </button>
        ))}
        <form
          className="mt-1 flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save(other);
          }}
        >
          <input className="input h-11" value={other} maxLength={300} placeholder={t("crm.flow.lostOther")} onChange={(e) => setOther(e.target.value)} />
          <button type="submit" className="btn btn-danger h-11" disabled={busy || !other.trim()}>
            {t("crm.flow.lostConfirm")}
          </button>
        </form>
      </div>
    </Modal>
  );
}

// ── Customer picker (from an offer) ─────────────────────────────────────────
export function CustomerPicker({ pkg, open, onClose, onPick }: { pkg: Package; open: boolean; onClose: () => void; onPick: (lead: Lead) => void }) {
  const { t } = useI18n();
  const { data } = useCrm();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase().replace(/\s/g, "");
  const leads = data.leads
    .filter((l) => l.stage !== "lost")
    .filter((l) => !q || `${leadName(l)}${l.phone ?? ""}`.toLowerCase().replace(/\s/g, "").includes(q))
    .sort((a, b) => Number(b.packageId === pkg.id) - Number(a.packageId === pkg.id) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
    .slice(0, 30);
  return (
    <Modal open={open} onClose={onClose} title={t("crm.flow.customerPicker.title")} subtitle={t("crm.flow.customerPicker.subtitle", { offer: pkg.name })}>
      <label className="relative block">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 muted" />
        <input className="input ps-9 h-11" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} placeholder={t("crm.flow.customerPicker.search")} />
      </label>
      {leads.length === 0 ? (
        <p className="mt-6 text-sm muted text-center">{t("crm.flow.customerPicker.empty")}</p>
      ) : (
        <ul className="mt-3 grid gap-1 max-h-[50vh] overflow-y-auto scroll-thin">
          {leads.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => onPick(l)} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-sand-100">
                <Avatar name={leadName(l)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" dir="auto">{leadName(l)}</span>
                  <span className="block text-xs muted ltr-inline">{l.phone ? formatPhone(l.phone) : "—"}</span>
                </span>
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <Users className="size-3.5" />
                  {t("crm.flow.customerPicker.choose")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
