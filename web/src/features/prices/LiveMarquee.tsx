"use client";

/**
 * The ticker (L-04): prices for the listed tickers from our own feed — the page's one stream connection (D-049),
 * loaded on idle so the shell's first load stays small (§3.1). Until a price has arrived (no stream configured, or the
 * price relay not yet streaming) it says so instead of scrolling invented numbers.
 */
import { useEffect, useState } from "react";
import Marquee, { type MarqueeCell } from "@/components/shell/Marquee";
import { onIdle } from "@/lib/idle";
import { MARQUEE } from "@/lib/copy";

export function LiveMarquee() {
  const [cells, setCells] = useState<readonly MarqueeCell[] | null>(null);
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    const cancelIdle = onIdle(() => {
      void import("./live-prices").then((m) => {
        if (!cancelled) stop = m.startLivePrices(setCells);
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      stop?.();
    };
  }, []);
  return <Marquee cells={cells} waiting={MARQUEE.waiting} />;
}
