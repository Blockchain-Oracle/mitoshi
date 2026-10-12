"use client";
/**
 * Fills this tab just made, shown as positions at once (S23 gate finding: the row appeared ~15 s after "opened"). The
 * positions list learns a wallet's Windows from the indexer, which can be a block or two behind the receipt, so a new
 * Window's position waited for the next 15 s poll. The booked fill is exact (contracts and cost from the receipt), so
 * the screen shows it until the fetched list has a position on that Window and side in the same home — then the
 * fetched one, which includes it, takes over. Kept a minute at most. In memory for the tab. D-227: a fetched row whose
 * cost the index hasn't caught up with (`costStale`, the Window's first fill) takes the receipt's exact cost while
 * the two agree on the size, so a new position never shows a free profit.
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

/**
 * A tap the key has signed and sent whose receipt is not in yet (D-150 confirmed-pending): shown as its own row from the
 * confirmed quote's figures — "Staking up to", "Confirming on Tempo…" — and never part of the positions the totals,
 * Close all or the chart read. The receipt replaces it with the booked fill; any other outcome removes it.
 */
export interface PendingFill {
  marketId: MarketId;
  side: Side;
  asset: string;
  expirySec: number;
  maxCostBase: bigint;
  atMs: number;
}

let pending: PendingFill[] = [];
const samePending = (p: PendingFill, marketId: MarketId, side: Side) => p.marketId.toLowerCase() === marketId.toLowerCase() && p.side === side;

export function rememberPending(p: PendingFill): void {
  pending = [...pending.filter((x) => Date.now() - x.atMs < FRESH_MS && !samePending(x, p.marketId, p.side)), p];
  listeners.forEach((l) => l());
}

export function forgetPending(marketId: MarketId, side: Side): void {
  if (!pending.some((x) => samePending(x, marketId, side))) return;
  pending = pending.filter((x) => !samePending(x, marketId, side));
  listeners.forEach((l) => l());
}

export function usePendingFills(): PendingFill[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => pending,
    () => pending,
  );
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
    const at = out.findIndex((p) => p.via === f.via && p.marketId.toLowerCase() === f.marketId.toLowerCase() && p.side === f.side);
    const got = at >= 0 && at < fetched.length ? out[at]! : null;
    if (got) {
      if (got.costStale && got.heldRaw === f.contractsRaw) out[at] = { ...got, costBase: f.costBase, costStale: undefined };
      continue;
    }
    const m = marketOf(f.marketId);
    if (!m) continue;
    if (at >= 0) {
      const p = out[at]!;
      out[at] = { ...p, heldRaw: p.heldRaw + f.contractsRaw, costBase: p.costBase + f.costBase };
      continue;
    }
    out.push({
      id: `${f.via === "vault" ? "v" : "w"}:${f.marketId}:${f.side}`, via: f.via, entryKey: f.marketId, marketId: f.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: m.expirySec, side: f.side,
      heldRaw: f.contractsRaw, costBase: f.costBase, realizedBase: 0n, decimals: m.decimals, entrySpot: null, trailStop: null, tpBase: null, slBase: null, openedAtMs: f.atMs,
    });
  }
  return out.sort((a, b) => a.expirySec - b.expirySec);
}
