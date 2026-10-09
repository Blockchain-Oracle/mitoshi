"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/live.ts (`useCommittedSpot`) — on `@cwf/markets/live-ticks`,
// with the source and staleness the terminal labels. The ladder and live-book hooks are re-done in 23d on Mitoshi's
// exit read (D-197).
import { liveTick, subscribeLiveTick, tickStale, type TickSource } from "@cwf/markets/live-ticks";
import { streamEverOpened } from "@cwf/markets/stream";
import { useEffect, useState } from "react";
import { ensureLiveTicks } from "@/features/prices/stream-config";

/** Tradash commits prices to its store at most every 200 ms per symbol (leading edge); PnL and reactions run on that. */
export const COMMIT_MS = 200;
/** How often a quiet line re-checks whether it went stale. */
const STALE_CHECK_MS = 5_000;

export interface CommittedSpot {
  /** Display price as a number (never money maths: amounts stay integers). */
  price: number | null;
  priceE8: bigint | null;
  atMs: number | null;
  source: TickSource | null;
  /** No tick, the stream down, or the newest tick older than its source's cadence allows. */
  stale: boolean;
  /** Stale because the stream has not opened yet in this tab (the first connect), not because it dropped. */
  connecting: boolean;
}

const EMPTY: CommittedSpot = { price: null, priceE8: null, atMs: null, source: null, stale: true, connecting: true };

function read(symbol: string): CommittedSpot {
  const connecting = !streamEverOpened();
  const tick = liveTick(symbol);
  if (!tick) return { price: null, priceE8: null, atMs: null, source: null, stale: true, connecting };
  const stale = tickStale(symbol, Date.now());
  return { price: Number(tick.priceE8) / 1e8, priceE8: tick.priceE8, atMs: tick.atMs, source: tick.source, stale, connecting: stale && connecting };
}

/**
 * The symbol's display spot, committed at most every 200 ms (leading edge, plus the last tick after a quiet gap).
 * `seed: false` for a list row: the newest tick only, no half-hour back-fill.
 */
export function useCommittedSpot(symbol: string | null, { seed = true }: { seed?: boolean } = {}): CommittedSpot {
  const [spot, setSpot] = useState<CommittedSpot>(EMPTY);
  useEffect(() => {
    if (!symbol) return setSpot(EMPTY);
    ensureLiveTicks();
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const commit = () => {
      last = performance.now();
      const next = read(symbol);
      setSpot((prev) => (prev.priceE8 === next.priceE8 && prev.atMs === next.atMs && prev.stale === next.stale && prev.connecting === next.connecting ? prev : next));
    };
    const off = subscribeLiveTick(
      symbol,
      () => {
        const wait = last + COMMIT_MS - performance.now();
        if (wait <= 0) commit();
        else trailing ??= setTimeout(() => ((trailing = null), commit()), wait);
      },
      { seed },
    );
    const staleCheck = setInterval(commit, STALE_CHECK_MS);
    commit();
    return () => {
      off();
      clearInterval(staleCheck);
      if (trailing) clearTimeout(trailing);
    };
  }, [symbol, seed]);
  return spot;
}
