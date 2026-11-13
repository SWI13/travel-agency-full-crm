import { useState, type FormEvent, type ReactNode } from "react";
import { useRevalidator } from "react-router";
import { Building2, ListChecks, Plus, Play, Trash2, UserRoundCog, Workflow } from "lucide-react";
import { api, errorMessage } from "~/crm/api";
import { PageBody } from "~/crm/shell";
import { playChime } from "~/crm/sound";
import { useCrm } from "~/crm/store";
import { useI18n } from "~/i18n";
import { LOCALES, type Locale } from "~/lib/constants";
import { cn } from "~/lib/format";
import type { ChecklistItem, Settings } from "~/lib/types";
import { Field, PageHeader, Spinner } from "~/ui";
import { useToast } from "~/ui/feedback";

const LOCALE_LABEL: Record<Locale, string> = { fr: "Français", ar: "العربية", en: "English" };

function Section({ icon: Icon, title, hint, children }: { icon: typeof Building2; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[17rem_1fr] py-8 border-b border-[var(--line)] last:border-0">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Icon className="size-5 text-emerald-600" />{title}</h2>
        {hint && <p className="mt-1.5 text-[13px] muted leading-relaxed">{hint}</p>}
      </div>
      <div className="panel p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-emerald-600" : "bg-navy-200")}>
        <span className={cn("absolute top-0.5 start-0.5 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5 rtl:-translate-x-5")} />
      </button>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[13px] muted">{hint}</span>}
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { t, locale } = useI18n();
  const { data, can, apply, sound, setSound } = useCrm();
  const toast = useToast();
  const revalidator = useRevalidator();
  const admin = can("settings.manage");
  const settings = data.settings;
  const [busy, setBusy] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>(settings.checklistItems);
  const s = "crm.settings";

  const save = async (section: string, patch: Partial<Settings>) => {
    setBusy(section);
    try {
      apply("settings", await api<Settings>("settings.update", patch));
      toast.success(t("crm.common.saved"));
    } catch (error) {
      toast.error(errorMessage(t, error));
    } finally {
      setBusy(null);
    }
  };

  const chooseLocale = (next: Locale) => {
    document.cookie = `crm_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    void revalidator.revalidate();
  };

  const saveAgency = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim() || null;
    void save("agency", {
      agencyName: String(form.get("agencyName") ?? "").trim(),
      agencyNameAr: value("agencyNameAr"),
      licenseNumber: value("licenseNumber"),
      phone: value("phone"),
      whatsappNumber: value("whatsappNumber"),
      email: value("email"),
      address: value("address"),
      addressAr: value("addressAr"),
      hours: value("hours"),
      mapsUrl: value("mapsUrl"),
      facebookUrl: value("facebookUrl"),
      instagramUrl: value("instagramUrl"),
    });
  };

  const saveChecklist = () => {
    const cleaned = items
      .map((item) => ({ key: item.key, label: item.label.trim() }))
      .filter((item) => item.label);
    if (!cleaned.length) return;
    void save("checklist", { checklistItems: cleaned });
  };

  const SaveButton = ({ section }: { section: string }) => (
    <button type="submit" className="btn btn-primary" disabled={busy === section}>
      {busy === section && <Spinner />}
      {t("crm.common.save")}
    </button>
  );

  return (
    <PageBody>
      <PageHeader title={t(`${s}.title`)} subtitle={t(`${s}.subtitle`)} />

      <div className="max-w-5xl">
        <Section icon={UserRoundCog} title={t(`${s}.personal`)}>
          <div className="grid gap-6">
            <div>
              <span className="field-label">{t(`${s}.language`)}</span>
              <div className="flex flex-wrap gap-2">
                {LOCALES.map((l) => (
                  <button key={l} type="button" lang={l} aria-pressed={l === locale} onClick={() => chooseLocale(l)} className={cn("btn", l === locale ? "btn-navy" : "btn-secondary")}>
                    {LOCALE_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Toggle checked={sound} onChange={setSound} label={t(`${s}.sound`)} hint={t(`${s}.soundHint`)} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={playChime}>
                <Play className="size-3.5" />
                {t(`${s}.testSound`)}
              </button>
            </div>
          </div>
        </Section>

        {!admin && <p className="py-8 text-sm muted">{t(`${s}.adminOnly`)}</p>}

        {admin && (
          <>
            <Section icon={Building2} title={t(`${s}.agency`)} hint={t(`${s}.agencyHint`)}>
              <form onSubmit={saveAgency} className="grid sm:grid-cols-2 gap-4">
                <Field label={t(`${s}.f.agencyName`)}><input name="agencyName" required maxLength={160} defaultValue={settings.agencyName} className="input" /></Field>
                <Field label={t(`${s}.f.agencyNameAr`)} optional><input name="agencyNameAr" dir="rtl" lang="ar" maxLength={160} defaultValue={settings.agencyNameAr ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.license`)} optional><input name="licenseNumber" maxLength={60} defaultValue={settings.licenseNumber ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.phone`)} optional><input name="phone" type="tel" dir="ltr" maxLength={30} defaultValue={settings.phone ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.whatsapp`)} hint={t(`${s}.f.whatsappHint`)} className="sm:col-span-2" optional>
                  <input name="whatsappNumber" inputMode="numeric" dir="ltr" maxLength={20} defaultValue={settings.whatsappNumber ?? ""} placeholder="213661234567" className="input sm:max-w-xs" />
                </Field>
                <Field label={t(`${s}.f.email`)} optional><input name="email" type="email" dir="ltr" maxLength={190} defaultValue={settings.email ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.hours`)} optional><input name="hours" maxLength={200} defaultValue={settings.hours ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.address`)} optional><input name="address" maxLength={300} defaultValue={settings.address ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.addressAr`)} optional><input name="addressAr" dir="rtl" lang="ar" maxLength={300} defaultValue={settings.addressAr ?? ""} className="input" /></Field>
                <Field label={t(`${s}.f.maps`)} className="sm:col-span-2" optional><input name="mapsUrl" type="url" dir="ltr" maxLength={1000} defaultValue={settings.mapsUrl ?? ""} placeholder="https://" className="input" /></Field>
                <Field label={t(`${s}.f.facebook`)} optional><input name="facebookUrl" type="url" dir="ltr" maxLength={300} defaultValue={settings.facebookUrl ?? ""} placeholder="https://" className="input" /></Field>
                <Field label={t(`${s}.f.instagram`)} optional><input name="instagramUrl" type="url" dir="ltr" maxLength={300} defaultValue={settings.instagramUrl ?? ""} placeholder="https://" className="input" /></Field>
                <div className="sm:col-span-2 flex justify-end"><SaveButton section="agency" /></div>
              </form>
            </Section>

            <Section icon={Workflow} title={t(`${s}.automation`)}>
              <form
                className="grid gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void save("automation", {
                    autoAssign: form.get("autoAssign") as Settings["autoAssign"],
                    autoContacted: form.get("autoContacted") === "on",
                    soundDefault: form.get("soundDefault") === "on",
                    crmLocale: form.get("crmLocale") as Locale,
                  });
                }}
              >
                <Field label={t(`${s}.autoAssign`)}>
                  <select name="autoAssign" className="input sm:max-w-md" defaultValue={settings.autoAssign}>
                    <option value="off">{t(`${s}.autoAssignOff`)}</option>
                    <option value="round_robin">{t(`${s}.autoAssignRR`)}</option>
                  </select>
                </Field>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="autoContacted" defaultChecked={settings.autoContacted} className="mt-0.5 size-4 accent-[var(--accent)]" />
                  {t(`${s}.autoContacted`)}
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="soundDefault" defaultChecked={settings.soundDefault} className="mt-0.5 size-4 accent-[var(--accent)]" />
                  {t(`${s}.soundDefault`)}
                </label>
                <Field label={t(`${s}.crmLocale`)}>
                  <select name="crmLocale" className="input sm:max-w-xs" defaultValue={settings.crmLocale}>
                    {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
                  </select>
                </Field>
                <div className="flex justify-end"><SaveButton section="automation" /></div>
              </form>
            </Section>

            <Section icon={ListChecks} title={t(`${s}.checklist`)} hint={t(`${s}.checklistHint`)}>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveChecklist();
                }}
              >
                {items.map((item, index) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="grid place-items-center size-7 rounded-full bg-sand-200 text-xs font-bold tabular shrink-0">{index + 1}</span>
                    <input
                      aria-label={t(`${s}.itemLabel`)}
                      className="input"
                      maxLength={80}
                      required
                      value={item.label}
                      onChange={(e) => setItems((list) => list.map((x) => (x.key === item.key ? { ...x, label: e.target.value } : x)))}
                    />
                    <button type="button" className="icon-btn hover:!text-rose-600" disabled={items.length <= 1} onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))} aria-label={t("crm.common.delete")}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={items.length >= 12} onClick={() => setItems((list) => [...list, { key: `step_${Date.now().toString(36)}`, label: "" }])}>
                    <Plus className="size-3.5" />
                    {t(`${s}.addItem`)}
                  </button>
                  <SaveButton section="checklist" />
                </div>
              </form>
            </Section>
          </>
        )}
      </div>
    </PageBody>
  );
}
