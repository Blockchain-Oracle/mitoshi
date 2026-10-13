"use client";
// Ported from Owarine 90a91d71:web/src/features/share/useShareCard.ts (R4-13a, D-227) — the share flow every Share pill
// runs: draw the PNG, hand it to the native share sheet where the platform takes files, else download it and open a
// pre-filled post so the reader attaches it. The path is decided inside the click, so the post's tab opens before any
// await (a late `window.open` is popup-blocked once the drawing takes a beat).
import { useCallback, useState } from "react";
import { notify } from "@/lib/toast";
import { SHARE } from "./copy";
import { renderShareImage, type ShareImage } from "./share-cards";

export interface ShareInput {
  image: ShareImage;
  fileName: string;
  text: string;
  /** The link the post carries (the proof page, the market). */
  url: string;
}

export function useShareCard() {
  const [busy, setBusy] = useState(false);

  const share = useCallback(async ({ image, fileName, text, url }: ShareInput) => {
    if (busy) return;
    setBusy(true);
    const probe = new File([new Uint8Array(8)], "probe.png", { type: "image/png" });
    const canNativeShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    let intentWin: Window | null = null;
    if (!canNativeShare && typeof window !== "undefined") {
      intentWin = window.open("about:blank", "_blank");
      if (intentWin) intentWin.opener = null;
    }
    const closeIntentWin = () => {
      try {
        intentWin?.close();
      } catch {
        // cross-origin after navigation
      }
    };
    try {
      const blob = await renderShareImage(image);
      const file = new File([blob], fileName, { type: "image/png" });
      const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      if (canNativeShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, url });
          return;
        } catch (error) {
          if ((error as DOMException)?.name === "AbortError") return; // the reader closed the sheet
        }
      }
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      if (intentWin) {
        intentWin.location.href = intentUrl;
        intentWin = null; // handed off: not closed
      } else {
        const opened = window.open(intentUrl, "_blank", "noopener,noreferrer");
        if (!opened) notify.neutral(SHARE.savedAttach);
      }
    } catch {
      notify.warning(SHARE.renderFailed);
    } finally {
      closeIntentWin();
      setBusy(false);
    }
  }, [busy]);

  return { busy, share };
}
