import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/format";
import { Modal } from "./index";

// ── Toasts ───────────────────────────────────────────────────────────────────
type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}
interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string, action?: Toast["action"]) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

// ── Confirmation dialogs ─────────────────────────────────────────────────────
interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, title: string, body?: string, action?: Toast["action"]) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, title, body, action }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4500);
    },
    [dismiss],
  );
  const toastApi = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push("success", title, body),
      error: (title, body) => push("error", title, body),
      info: (title, body, action) => push("info", title, body, action),
    }),
    [push],
  );

  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <Modal
          open={!!pending}
          onClose={() => settle(false)}
          title={pending?.title ?? ""}
          size="sm"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>{t("crm.common.cancel")}</button>
              <button type="button" data-autofocus className={cn("btn", pending?.danger ? "btn-danger" : "btn-primary")} onClick={() => settle(true)}>
                {pending?.confirmLabel ?? t("crm.common.confirm")}
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-navy-700">{pending?.body}</p>
        </Modal>

        <div className="fixed z-[90] bottom-4 end-4 start-4 sm:start-auto flex flex-col gap-2 sm:w-96 pointer-events-none" aria-live="polite">
          {toasts.map((toast) => {
            const Icon = toast.kind === "success" ? CircleCheck : toast.kind === "error" ? CircleAlert : Info;
            return (
              <div key={toast.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-xl bg-navy-900 text-white px-4 py-3 shadow-lift animate-pop">
                <Icon className={cn("size-5 mt-0.5 shrink-0", toast.kind === "success" ? "text-emerald-400" : toast.kind === "error" ? "text-rose-400" : "text-gold-300")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.body && <p className="text-[13px] text-navy-200 mt-0.5 break-words line-clamp-2">{toast.body}</p>}
                  {toast.action && (
                    <button
                      type="button"
                      className="mt-1.5 text-[13px] font-semibold text-emerald-300 hover:text-emerald-200"
                      onClick={() => {
                        toast.action!.onClick();
                        dismiss(toast.id);
                      }}
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>
                <button type="button" className="text-navy-300 hover:text-white" onClick={() => dismiss(toast.id)} aria-label={t("crm.common.close")}>
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside FeedbackProvider");
  return api;
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside FeedbackProvider");
  return confirm;
}
