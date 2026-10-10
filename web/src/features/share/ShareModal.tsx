"use client";
// The share modal (S5 L-22, S23g RV-83 "Share PnL"; Owarine ecb7565b `ShareSheet` as a centred modal, RV-14): PnL ·
// ROI · Both, the card itself as the preview (the PNG that Download saves, drawn by `share-png.ts`), Download and Share
// on X with the result's own words. Disabled while amounts are hidden (RV-10). The card draws in the browser; nothing
// leaves it until the reader shares.
import { formatCadence } from "@cwf/core/copy";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { tapFeedback } from "@/lib/feedback";
import { usePrivacy } from "@/lib/privacy";
import { SHARE } from "./copy";
import { renderSharePng, saveSharePng } from "./share-png";

/** What a card is about: an open position (Mark, valued by what Close pays) or a closed trade (Exit). */
export interface ShareSubject {
  asset: string;
  side: "up" | "down";
  intervalSec: number;
  pnlBase: bigint;
  costBase: bigint;
  decimals: number;
  /** Spot prices, already formatted ("$82,700.12"); null when not known in this browser. */
  entry: string | null;
  exit: string | null;
  closed: boolean;
}

type Mode = (typeof SHARE.modes)[number]["value"];

const dollars = (base: bigint, decimals: number) => {
  const n = Math.abs(Number(base)) / 10 ** decimals;
  return `${base < 0n ? "−" : "+"}$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function ShareModal({ subject, open, onOpenChange }: { subject: ShareSubject | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  // The card is the moment the reader tapped Share: a live PnL moves every tick, and a card that redraws under the
  // reader's thumb isn't one they can post.
  const [s, setS] = useState<ShareSubject | null>(null);
  useEffect(() => {
    if (open) setS(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frozen on open by design
  }, [open]);
  const [mode, setMode] = useState<Mode>("both");
  const [png, setPng] = useState<{ url: string; blob: Blob } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<keyof typeof SHARE.download>("idle");
  const masked = usePrivacy();

  const roi = s && s.costBase > 0n ? (Number(s.pnlBase) / Number(s.costBase)) * 100 : 0;
  const pnlText = s ? dollars(s.pnlBase, s.decimals) : "";
  const roiText = `${roi >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}%`;
  const result = mode === "pnl" ? pnlText : mode === "roi" ? roiText : `${pnlText} · ${roiText}`;
  const call = s ? `${s.asset} ${s.side.toUpperCase()} · ${formatCadence(s.intervalSec).toUpperCase()}` : "";
  const link = s && typeof window !== "undefined" ? `${window.location.origin}/trade/${s.asset}` : "";
  const win = s ? s.pnlBase >= 0n : true;

  useEffect(() => {
    if (!open || !s || masked) return;
    let live = true;
    let made: string | null = null;
    setFailed(false);
    renderSharePng({ call, result, win, entry: s.entry, exit: s.exit, exitLabel: s.closed ? "Exit" : "Mark", url: link })
      .then((blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setPng({ url: made, blob });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [open, s, masked, call, result, win, link, attempt]); // s is frozen state; the rest are strings

  if (!s) return null;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(SHARE.post(s.asset, s.side, pnlText, roi, win))}&url=${encodeURIComponent(link)}`;
  const button = "flex min-h-touch items-center justify-center rounded-full px-5 type-body-strong disabled:opacity-60";
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={s.closed ? SHARE.title.closed : SHARE.title.open}>
      {masked ? (
        <p className="type-body text-ink-secondary">{SHARE.masked}</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <SegmentedControl label={SHARE.modeLabel} options={SHARE.modes} value={mode} onValueChange={(m) => (tapFeedback(), setMode(m))} />
          <div className="grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-lg border border-hairline bg-surface-2">
            {failed ? (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="type-body text-ink underline underline-offset-4">{`${SHARE.drawFailed} ${SHARE.retry}`}</button>
            ) : png ? (
              // A blob: URL the browser drew; next/image has nothing to optimise here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={png.url} alt={SHARE.preview(call, result)} className="size-full object-contain" />
            ) : (
              <span role="status" className="type-caption text-ink-secondary">{SHARE.drawing}</span>
            )}
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!png || saving === "preparing" || saving === "saving"}
              onClick={async () => {
                if (!png) return;
                tapFeedback();
                try {
                  setSaving("saving");
                  await saveSharePng(png.blob, `mitoshi-${s.asset.toLowerCase()}-${win ? "profit" : "loss"}.png`);
                  setSaving("idle");
                } catch {
                  setSaving("retry");
                }
              }}
              className={`${button} border border-hairline text-ink hover:bg-surface-2`}
            >
              {SHARE.download[saving]}
            </button>
            <a href={intent} target="_blank" rel="noopener noreferrer" onClick={() => tapFeedback()} className={`${button} bg-accent-fill text-on-accent!`}>
              {SHARE.onX}
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
