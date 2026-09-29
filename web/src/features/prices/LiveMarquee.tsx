"use client";

/**
 * The ticker's data (L-04): prices for the listed tickers from our own feed (the D-049 stream). Until a price has
 * arrived — no stream configured, or the price relay not yet streaming — the ticker states that instead of scrolling
 * invented numbers. Wired to the real-time client in the same stage (1b real-time client).
 */
import Marquee, { type MarqueeCell } from "@/components/shell/Marquee";
import { MARQUEE } from "@/lib/copy";

export function LiveMarquee({ cells = null }: { cells?: readonly MarqueeCell[] | null }) {
  return <Marquee cells={cells} waiting={MARQUEE.waiting} />;
}
