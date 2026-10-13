// Ported from Masayume 68f7a09:packages/core/src/strategies/record.ts
import type { MarketId } from "../types/market";
import { estPayoutBase } from "../claims/payout";
import type { FillSettlement, StrategyFill } from "./types";

export interface ScoredFill extends StrategyFill {
  settled: boolean;
  /** Collateral the fill returned at settlement, 0 for a loss, half for a void; null while open. */
  payoutBase: bigint | null;
  pnlBase: bigint | null;
}

export interface StrategyRecordStats {
  fills: number;
  settled: number;
  wins: number;
  losses: number;
  voids: number;
  netBase: bigint;
  stakedBase: bigint;
  /** Cumulative net after each settled fill, oldest first — the equity curve. */
  curve: Array<{ atSec: number; cumBase: bigint }>;
  lastActiveSec: number;
  distinctSubscribers: number;
}

/** Scores one fill by the chain's rule: a winner pays one collateral per token, a void half, a loser nothing. */
export function scoreFill(fill: StrategyFill, settlement: FillSettlement | null, feeBps: number): ScoredFill {
  if (!settlement || !settlement.settled) return { ...fill, settled: false, payoutBase: null, pnlBase: null };
  const outcomeIdx = fill.side === "up" ? 0 : 1;
  const payoutBase = settlement.voided
    ? estPayoutBase(fill.tokenDeltaRaw, "void", feeBps)
    : settlement.winningOutcome === outcomeIdx
      ? estPayoutBase(fill.tokenDeltaRaw, "win", feeBps)
      : 0n;
  return { ...fill, settled: true, payoutBase, pnlBase: payoutBase - fill.cashDeltaBase };
}

/**
 * Scores one fill by what its Window actually paid (Tempo's engine: a side's tokens redeem at that side's payout
 * numerator out of 10,000,000; a void pays what its numerators say; no settlement fee). Null facts or an open Window: open.
 */
export function scoreFillByPayout(fill: StrategyFill, facts: { settled: boolean; payoutYes: bigint; payoutNo: bigint } | null): ScoredFill {
  if (!facts || !facts.settled) return { ...fill, settled: false, payoutBase: null, pnlBase: null };
  const numerator = fill.side === "up" ? facts.payoutYes : facts.payoutNo;
  const payoutBase = (fill.tokenDeltaRaw * numerator) / 10_000_000n;
  return { ...fill, settled: true, payoutBase, pnlBase: payoutBase - fill.cashDeltaBase };
}

/** The record the card and the leaderboard show — losses counted, always; win rate is not a quality metric. */
export function strategyRecord(fills: readonly ScoredFill[]): StrategyRecordStats {
  const settled = fills.filter((f) => f.settled && f.pnlBase !== null).sort((a, b) => a.atSec - b.atSec);
  let cum = 0n;
  const curve = settled.map((f) => {
    cum += f.pnlBase as bigint;
    return { atSec: f.atSec, cumBase: cum };
  });
  const stats: StrategyRecordStats = {
    fills: fills.length,
    settled: settled.length,
    wins: settled.filter((f) => (f.pnlBase as bigint) > 0n).length,
    losses: settled.filter((f) => (f.pnlBase as bigint) < 0n).length,
    voids: settled.filter((f) => (f.pnlBase as bigint) === 0n).length,
    netBase: cum,
    stakedBase: fills.reduce((sum, f) => sum + f.cashDeltaBase, 0n),
    curve,
    lastActiveSec: fills.reduce((max, f) => Math.max(max, f.atSec), 0),
    distinctSubscribers: new Set(fills.map((f) => f.owner.toLowerCase())).size,
  };
  return stats;
}

/** At most `max` points of an equity curve, evenly by index with its first and last kept: a long record's chart
 *  without every settled fill on the wire. */
export function thinCurve<T>(curve: readonly T[], max: number): T[] {
  if (curve.length <= max) return [...curve];
  const step = (curve.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => curve[Math.round(i * step)]!);
}

/** Fills grouped by Window, so settlement facts are read once per market rather than once per fill. */
export function marketsOfFills(fills: readonly StrategyFill[]): MarketId[] {
  return [...new Set(fills.map((f) => f.marketId))];
}
