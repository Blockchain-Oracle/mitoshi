// Ported from Agari 03b30ab:web/src/features/markets/reels/ReelHolding.tsx (S13 step 9) — the reel's loading and empty
// card: the card's frame with a pulsing cue, never standing in for a market.
import type { ReactNode } from "react";

export function ReelHolding({ children }: { children: ReactNode }) {
  return (
    <section className="feed-card reel-slot">
      <div className="reel-card holding">
        <p className="reel-holding-title">{children}</p>
        <div aria-hidden className="reel-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
