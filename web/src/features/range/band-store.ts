"use client";
/**
 * The band the ticket is composing, published for the hero chart (E.1: "band drawn on the hero chart", a Masayume gap):
 * a tiny external store (`useSyncExternalStore`) so the chart draws the two edges on the Window the ticket prices, and
 * clears them when the ticket leaves Range mode.
 */
import { useSyncExternalStore } from "react";
import type { MarketId } from "@cwf/core";

export interface DrawnBand {
  marketId: MarketId;
  /** Prices at the engine's e-8 scale (the chart's). */
  lowE8: bigint;
  highE8: bigint;
  side: "inside" | "outside";
}

let current: DrawnBand | null = null;
const listeners = new Set<() => void>();

export function publishBand(next: DrawnBand | null): void {
  if (current === next || (current && next && current.marketId === next.marketId && current.lowE8 === next.lowE8 && current.highE8 === next.highE8 && current.side === next.side)) return;
  current = next;
  for (const l of listeners) l();
}

export function useDrawnBand(): DrawnBand | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
