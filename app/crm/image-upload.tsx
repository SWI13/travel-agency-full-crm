import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Link2, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/format";
import { ApiError, errorMessage } from "./api";
import { useToast } from "~/ui/feedback";

const MAX_SIDE = 1600;

/** Resizes a photo in the browser (WebP, or JPEG where WebP encoding is missing). */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode("image/webp", 0.82);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.85);
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

/**
 * Photo field for package covers: drop or pick a photo from the computer or the
 * phone gallery. The URL ends up in a hidden input named `name`, so the
 * surrounding form reads it like any other field. A link can still be pasted.
 */
export function ImageUpload({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [linkMode, setLinkMode] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("crm.upload.notImage"));
      return;
    }
    setBusy(true);
    try {
      const body = await compress(file);
      const response = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": body.type }, body });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new ApiError(json?.code ?? "server_error", json?.message ?? "", response.status, json?.details ?? null);
      setUrl(json.data.url);
      setLinkMode(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? errorMessage(t, error) : t("crm.upload.notImage"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={url} />
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} tabIndex={-1} />

      {url ? (
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-sand-100">
          <img src={url} alt="" className="h-44 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 p-2 bg-gradient-to-t from-navy-950/70 to-transparent">
            <button type="button" className="btn btn-sm bg-white/95 text-navy-900 hover:bg-white" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {t("crm.upload.change")}
            </button>
            <button type="button" className="btn btn-sm bg-white/95 text-rose-700 hover:bg-white" onClick={() => setUrl("")} disabled={busy}>
              <Trash2 className="size-3.5" />
              {t("crm.upload.remove")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={busy}
          className={cn(
            "flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition-colors",
            dragging ? "border-emerald-500 bg-emerald-50" : "border-[var(--line)] bg-sand-50 hover:border-emerald-400 hover:bg-emerald-50/50",
          )}
        >
          {busy ? <LoaderCircle className="size-7 animate-spin text-emerald-700" /> : <ImagePlus className="size-7 text-emerald-700" />}
          <span className="font-semibold text-navy-900">{busy ? t("crm.upload.uploading") : t("crm.upload.choose")}</span>
          <span className="text-xs muted">{t("crm.upload.hint")}</span>
        </button>
      )}

      {linkMode ? (
        <input
          type="url"
          dir="ltr"
          maxLength={1000}
          placeholder="https://"
          className="input"
          value={url.startsWith("http") ? url : ""}
          onChange={(e) => setUrl(e.target.value.trim())}
          autoFocus
        />
      ) : (
        <button type="button" className="inline-flex w-fit items-center gap-1.5 text-xs font-medium muted hover:text-navy-900" onClick={() => setLinkMode(true)}>
          <Link2 className="size-3.5" />
          {t("crm.upload.orLink")}
        </button>
      )}
    </div>
  );
}
