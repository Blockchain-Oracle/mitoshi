"use client";
/**
 * Fills this tab just made, shown as positions at once (S23 gate finding: the row appeared ~15 s after "opened"). The
 * positions list learns a wallet's Windows from the indexer, which can be a block or two behind the receipt, so a new
 * Window's position waited for the next 15 s poll. The booked fill is exact (contracts and cost from the receipt), so
 * the screen shows it until the fetched list has a position on that Window and side in the same home — then the
 * fetched one, which includes it, takes over. Kept a minute at most. In memory for the tab.
 */
import type { EventMarket, MarketId, Side } from "@cwf/core";
import { useSyncExternalStore } from "react";
import type { TerminalPosition } from "./terminal-positions";

export interface FreshFill {
  marketId: MarketId;
  side: Side;
  via: "wallet" | "vault";
  contractsRaw: bigint;
  costBase: bigint;
  atMs: number;
}

export const FRESH_MS = 60_000;

let fills: FreshFill[] = [];
const listeners = new Set<() => void>();

export function rememberFill(f: FreshFill): void {
  fills = [...fills.filter((x) => Date.now() - x.atMs < FRESH_MS), f];
  listeners.forEach((l) => l());
}

export function useFreshFills(): FreshFill[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => fills,
    () => fills,
  );
}

/** The fetched positions plus each fresh fill they don't show yet (same home, Window and side), on a known Window. */
export function withFreshFills(fetched: TerminalPosition[], fresh: readonly FreshFill[], marketOf: (id: MarketId) => EventMarket | null, nowMs: number): TerminalPosition[] {
  const out = [...fetched];
  for (const f of fresh) {
    if (nowMs - f.atMs >= FRESH_MS) continue;
    if (fetched.some((p) => p.via === f.via && p.marketId.toLowerCase() === f.marketId.toLowerCase() && p.side === f.side)) continue;
    const m = marketOf(f.marketId);
    if (!m) continue;
    const id = `${f.via === "vault" ? "v" : "w"}:${f.marketId}`;
    const same = out.findIndex((p) => p.id === id && p.side === f.side);
    if (same >= 0) {
      const p = out[same]!;
      out[same] = { ...p, heldRaw: p.heldRaw + f.contractsRaw, costBase: p.costBase + f.costBase };
      continue;
    }
    out.push({
      id, via: f.via, entryKey: f.marketId, marketId: f.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: m.expirySec, side: f.side,
      heldRaw: f.contractsRaw, costBase: f.costBase, decimals: m.decimals, entrySpot: null, trailStop: null, tpBase: null, slBase: null, openedAtMs: f.atMs,
    });
  }
  return out.sort((a, b) => a.expirySec - b.expirySec);
}
