"use client";
// R6 (D-230, T10): one design for a signed-in page seen signed out, replacing six walls. From 21st.dev 19377
// shadcnui-blocks/empty-state-04 revamped: its masked preview (`mask-y-from-60%`) becomes the page's OWN layout filled
// with real demo or public data (passed in as children, never mock rows), inert and fading into a foot that says whose
// data it is and offers exactly one sign-in for this page's intent — sign-in at the end, never a wall before value
// (D-223/D-224). The marquee loop is dropped (restrained motion). References: Revolut's watchlist rows as the selling
// point, Dub's product preview beside its sign-in (Refero).
import { SIGNED_OUT } from "@cwf/core/copy";
import type { ReactNode } from "react";
import { Pill } from "@/components/kit/Pill";
import { useWalletSession } from "@/lib/wallet-session";
import { cn } from "@/lib/utils";

export interface SignedOutPreviewProps {
  /** The sign-in sheet's intent, in the page's words ("to see your portfolio"). */
  intent: string;
  /** Honest provenance: "Demo account", "Top trader 0x12…ab", "Live, public". */
  source: string;
  /** ≤ 6 words, the page's own ("Your calls, live"); the CTA is always "Sign in to see yours". */
  title?: string;
  /** The page's own layout, filled with demo or public real data (or its LoadingState shape while that loads). */
  children: ReactNode;
  className?: string;
}

export function SignedOutPreview({ intent, source, title, children, className }: SignedOutPreviewProps) {
  const session = useWalletSession();
  return (
    <section className={cn("so-preview", className)} aria-label={title ?? SIGNED_OUT.cta}>
      <p className="sr-only">{SIGNED_OUT.sr(source)}</p>
      <div className="so-preview-body" inert aria-hidden>
        {children}
      </div>
      <div className="so-preview-foot">
        <span className="so-preview-chip type-label-micro">{source}</span>
        {title ? <h2 className="so-preview-title type-title">{title}</h2> : null}
        <Pill tone="accent" size="lg" className="max-lg:w-full lg:min-w-60" onClick={() => session.connectFor(intent)}>
          {SIGNED_OUT.cta}
        </Pill>
      </div>
    </section>
  );
}
