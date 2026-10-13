"use client";
// The Share pill (R4-13a, D-227; Owarine 90a91d71's ShareCallButton and ShareTradeButton in one): a 36 px kit pill with a
// 44 px hit area that draws the card and shares it (`useShareCard`). While amounts are hidden the card would print them,
// so the pill gives way to "Amounts are hidden." and a Show that turns privacy mode off right there — the top line's eye
// is not on a phone (bug 14).
import { Share2 } from "lucide-react";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { tapFeedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { SHARE } from "./copy";
import { useShareCard, type ShareInput } from "./useShareCard";
import "./share.css";

export function MaskedShare({ className }: { className?: string }) {
  return (
    <span className={cn("share-masked", className)}>
      {SHARE.masked}
      <button type="button" className="share-masked-show" onClick={() => setPrivacy(false)}>{SHARE.show}</button>
    </span>
  );
}

/** `input` is read at the tap, so a live figure is frozen the moment the reader shares. `amounts` false: nothing to hide. */
export function SharePill({ input, amounts = true, className }: { input: () => ShareInput; amounts?: boolean; className?: string }) {
  const masked = usePrivacy();
  const { busy, share } = useShareCard();
  if (masked && amounts) return <MaskedShare className={className} />;
  return (
    <button
      type="button"
      className={cn("kit-pill kit-pill--white kit-pill--sm", className)}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => {
        tapFeedback();
        void share(input());
      }}
    >
      <Share2 aria-hidden />
      {busy ? SHARE.rendering : SHARE.pill}
    </button>
  );
}
