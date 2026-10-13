"use client";
// From 21st.dev 377 originui/use-image-upload — revamped (R4-11, D-227) into a launch's logo field: kept the hook's hidden
// file input, the object-URL preview revoked on remove and on unmount, and the click-to-pick thumbnail; added a drop
// target, the upload itself (POST `/api/launch/logo`, which checks type, size and squareness and answers the hosted URL
// a token's `logoURI` carries) and its refusal in words. No new dependency; the frame lives in `styles/launch.css`.
import { ImagePlus, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

export interface UploadedLogo { url: string; sha256: string }

export function ImageDropzone({ value, onChange, label, hint, className }: { value: UploadedLogo | null; onChange: (logo: UploadedLogo | null) => void; label: string; hint: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const clear = useCallback(() => {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    setPreviewUrl(null);
    if (input.current) input.current.value = "";
    onChange(null);
  }, [onChange]);
  useEffect(() => () => void (preview.current && URL.revokeObjectURL(preview.current)), []);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = URL.createObjectURL(file);
    setPreviewUrl(preview.current);
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/launch/logo", { method: "POST", body }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { url?: string; sha256?: string; message?: string }) : {};
    setBusy(false);
    if (!res?.ok || !json.url || !json.sha256) {
      setError(json.message ?? "The logo couldn't be uploaded.");
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = null;
      setPreviewUrl(null);
      return onChange(null);
    }
    onChange({ url: json.url, sha256: json.sha256 });
  };
  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files?.[0]);
  };
  const shown = previewUrl ?? value?.url ?? null;

  return (
    <div className={cn("dropzone", className)}>
      <button type="button" className="dropzone-target" data-over={over ? "" : undefined} aria-label={label} title={label} onClick={() => input.current?.click()} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        {/* A blob or our own hosted URL: plain img, no remote loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown ? <img src={shown} alt="" className="dropzone-img" /> : <ImagePlus aria-hidden className="size-6" />}
        {busy ? <span className="dropzone-busy"><Loader2 aria-hidden className="size-5 animate-spin motion-reduce:animate-none" /></span> : null}
      </button>
      <div className="dropzone-side">
        <span className="type-body-strong text-ink">{label}</span>
        <span className="type-caption text-ink-secondary">{error ?? hint}</span>
        {shown && !busy ? (
          <button type="button" className="dropzone-remove" onClick={clear}>
            <X aria-hidden className="size-3.5" />
            Remove
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void take(e.target.files?.[0])} />
    </div>
  );
}
