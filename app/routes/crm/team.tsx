import { useMemo, useState, type FormEvent } from "react";
import { displayLogin } from "~/lib/login";
import { KeyRound, Pencil, UserPlus, UsersRound } from "lucide-react";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { ROLES, type Role } from "~/lib/constants";
import { cn, timeAgo } from "~/lib/format";
import { teamPerformance } from "~/lib/stats";
import type { Staff } from "~/lib/types";
import { Avatar, Badge, EmptyState, Field, Modal, PageHeader, Spinner } from "~/ui";
import { useConfirm, useToast } from "~/ui/feedback";

const ROLE_TONE: Record<Role, string> = { admin: "navy", manager: "gold", agent: "teal" };

export default function TeamPage() {
  const { t, locale } = useI18n();
  const { data, can, apply, run } = useCrm();
  const confirm = useConfirm();
  const manage = can("team.manage");
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [resetFor, setResetFor] = useState<Staff | null>(null);
  const rows = useMemo(() => teamPerformance(data.leads, data.staff, data.bookings).sort((a, b) => Number(b.staff.isActive) - Number(a.staff.isActive)), [data.leads, data.staff, data.bookings]);
  const th = "crm.team.th";

  const toggleActive = async (staff: Staff) => {
    if (staff.isActive && !(await confirm({ title: t("crm.team.deactivate"), body: t("crm.team.deactivateConfirm", { name: staff.name }), danger: true, confirmLabel: t("crm.team.deactivate") }))) return;
    const updated = await run<Staff>("team.update", { id: staff.id, isActive: !staff.isActive }, t("crm.common.saved"));
    if (updated) apply("staff", updated);
  };

  if (!can("team.view")) {
    return <PageBody><EmptyState icon={UsersRound} title={t("crm.errors.forbidden")} /></PageBody>;
  }

  return (
    <PageBody>
      <PageHeader
        title={t("crm.team.title")}
        subtitle={manage ? t("crm.team.subtitle") : t("crm.team.viewOnly")}
        actions={
          manage && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <UserPlus className="size-4" />
              {t("crm.team.new")}
            </button>
          )
        }
      />

      <div className="panel overflow-x-auto scroll-thin">
        <table className="data-table min-w-[56rem]">
          <thead>
            <tr>
              <th>{t(`${th}.employee`)}</th>
              <th>{t(`${th}.role`)}</th>
              <th>{t(`${th}.status`)}</th>
              <th className="!text-end">{t(`${th}.leads`)}</th>
              <th className="!text-end">{t(`${th}.contacted`)}</th>
              <th className="!text-end">{t(`${th}.converted`)}</th>
              <th>{t(`${th}.lastLogin`)}</th>
              {manage && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ staff, received, contacted, converted }) => (
              <tr key={staff.id} className={cn(!staff.isActive && "opacity-55")}>
                <td>
                  <span className="flex items-center gap-3">
                    <Avatar name={staff.name} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {staff.name}
                        {staff.id === data.me.id && <Badge tone="emerald">{t("crm.common.you")}</Badge>}
                        {staff.email.endsWith("@demo.invalid") && <Badge tone="demo">{t("crm.team.demoAccount")}</Badge>}
                      </span>
                      <span className="block text-xs muted ltr-inline">{displayLogin(staff.email)}</span>
                    </span>
                  </span>
                </td>
                <td><Badge tone={ROLE_TONE[staff.role]} title={t(`crm.roleHint.${staff.role}`)}>{t(`crm.role.${staff.role}`)}</Badge></td>
                <td><Badge tone={staff.isActive ? "emerald" : "neutral"} dot>{staff.isActive ? t("crm.team.active") : t("crm.team.inactive")}</Badge></td>
                <td className="text-end tabular">{received}</td>
                <td className="text-end tabular">{contacted}</td>
                <td className="text-end tabular font-semibold text-emerald-700">{converted}</td>
                <td className="muted whitespace-nowrap">{staff.lastLoginAt ? timeAgo(staff.lastLoginAt, locale) : t("crm.common.never")}</td>
                {manage && (
                  <td className="text-end whitespace-nowrap">
                    <button type="button" className="icon-btn" onClick={() => setEditing(staff)} aria-label={t("crm.team.edit")} title={t("crm.team.edit")}><Pencil className="size-4" /></button>
                    <button type="button" className="icon-btn" onClick={() => setResetFor(staff)} aria-label={t("crm.team.resetPassword")} title={t("crm.team.resetPassword")}><KeyRound className="size-4" /></button>
                    {staff.id !== data.me.id && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(staff)}>
                        {staff.isActive ? t("crm.team.deactivate") : t("crm.team.activate")}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-6 grid gap-3 md:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role} className="rounded-xl border border-[var(--line)] bg-white/60 p-4">
            <dt><Badge tone={ROLE_TONE[role]}>{t(`crm.role.${role}`)}</Badge></dt>
            <dd className="mt-2 text-[13px] muted leading-relaxed">{t(`crm.roleHint.${role}`)}</dd>
          </div>
        ))}
      </dl>

      {editing && <StaffForm staff={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {resetFor && <ResetPassword staff={resetFor} onClose={() => setResetFor(null)} />}
    </PageBody>
  );
}

function StaffForm({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const { t } = useI18n();
  const { data, apply } = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = "crm.team.form";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const saved = staff
        ? await api<Staff>("team.update", { id: staff.id, name: form.get("name"), role: form.get("role") })
        : await api<Staff>("team.create", { name: form.get("name"), username: form.get("username"), password: form.get("password"), role: form.get("role") });
      apply("staff", saved);
      toast.success(staff ? t("crm.common.saved") : t("crm.team.created"));
      onClose();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={staff ? t("crm.team.edit") : t("crm.team.new")}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={t(`${f}.name`)}><input name="name" required minLength={2} maxLength={120} defaultValue={staff?.name} className="input" /></Field>
        {!staff && (
          <>
            <Field label={t(`${f}.username`)} hint={t("crm.auth.usernameHint")}><input name="username" type="text" required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,31}|[^@\s]+@[^@\s]+" autoCapitalize="none" spellCheck={false} dir="ltr" autoComplete="off" className="input" /></Field>
            <Field label={t(`${f}.password`)} hint={t("crm.auth.passwordHint")}><input name="password" type="password" required minLength={10} dir="ltr" autoComplete="new-password" className="input" /></Field>
          </>
        )}
        <fieldset>
          <legend className="field-label">{t(`${f}.role`)}</legend>
          <div className="grid gap-2">
            {ROLES.map((role) => (
              <label key={role} className="flex items-start gap-3 rounded-xl border border-[var(--line)] p-3 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/60">
                <input type="radio" name="role" value={role} defaultChecked={(staff?.role ?? "agent") === role} disabled={staff?.id === data.me.id && role !== "admin"} className="mt-1 accent-[var(--accent)]" />
                <span>
                  <span className="block text-sm font-semibold">{t(`crm.role.${role}`)}</span>
                  <span className="block text-[13px] muted">{t(`crm.roleHint.${role}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2.5">{error}</p>}
        <div className="flex justify-end gap-2">
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

function ResetPassword({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("team.resetPassword", { id: staff.id, password: new FormData(event.currentTarget).get("password") });
      toast.success(t("crm.team.resetDone"));
      onClose();
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={t("crm.team.resetPassword")} subtitle={staff.name} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <Field label={t("crm.auth.newPassword")} hint={t("crm.auth.passwordHint")}>
          <input name="password" type="password" required minLength={10} dir="ltr" autoComplete="new-password" className="input" />
        </Field>
        <div className="flex justify-end gap-2">
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
