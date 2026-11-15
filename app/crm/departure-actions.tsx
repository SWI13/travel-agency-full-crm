import { useState } from "react";
import { Plane, Undo2 } from "lucide-react";
import { useI18n } from "~/i18n";
import { VOID_PAYMENT_STATUSES } from "~/lib/constants";
import { formatDate, formatDzd } from "~/lib/format";
import type { Booking } from "~/lib/types";
import { Field, Modal, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";
import { api, errorMessage } from "./api";
import { useCrm } from "./store";

/** A booking can be marked as departed while it is active and has not been marked yet. */
export const canMarkDeparted = (b: Booking) => !b.departedAt && !VOID_PAYMENT_STATUSES.includes(b.paymentStatus);

/** Two-step safety: the employee must confirm what they are about to record. */
export function MarkDepartedModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { apply, departureById, packageById } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const departure = departureById.get(booking.departureId);
  const remaining = Math.max(0, booking.totalDzd - booking.paidDzd);

  async function confirm() {
    setBusy(true);
    try {
      apply("bookings", await api<Booking>("bookings.markDeparted", { id: booking.id }));
      toast.success(t("crm.bookings.travel.done"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("crm.bookings.travel.confirmTitle")}
      subtitle={booking.customerName}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
            {busy ? <Spinner /> : <Plane className="size-4" />}
            {t("crm.bookings.travel.confirm")}
          </button>
        </>
      }
    >
      <p className="text-sm">
        {t("crm.bookings.travel.confirmBody", {
          travelers: booking.travelers,
          offer: packageById.get(booking.packageId)?.name ?? "—",
          date: formatDate(departure?.departDate, locale),
        })}
      </p>
      {remaining > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("crm.bookings.travel.unpaid", { amount: formatDzd(remaining, locale) })}
        </p>
      )}
    </Modal>
  );
}

/** Authorised correction of an accidental "departed". Recorded in the activity log. */
export function UndoDepartedModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { t } = useI18n();
  const { apply } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function confirm() {
    setBusy(true);
    try {
      apply("bookings", await api<Booking>("bookings.undoDeparted", { id: booking.id, reason: reason.trim() || null }));
      toast.success(t("crm.bookings.travel.undone"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("crm.bookings.travel.undoTitle")}
      subtitle={booking.customerName}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t("crm.common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
            {busy ? <Spinner /> : <Undo2 className="size-4" />}
            {t("crm.bookings.travel.undoConfirm")}
          </button>
        </>
      }
    >
      <p className="text-sm">{t("crm.bookings.travel.undoBody")}</p>
      <Field label={t("crm.bookings.travel.undoReason")} className="mt-3" optional>
        <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}
