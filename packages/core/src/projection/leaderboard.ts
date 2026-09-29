// Ported from Masayume 68f7a09:packages/core/src/projection/leaderboard.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import type { Address } from "../types/primitives";
import { winStreaks } from "./equity";
import { roundSettledAtMs } from "./settle";
import type { SettledRound, TraderRanking } from "./types";

export interface RankWindow {
  windowStartMs: number;
  windowEndMs: number;
}

export interface RankResult {
  rankings: TraderRanking[];
  /** Rounds closed inside the window across every wallet. */
  closedCalls: number;
  /** Wallets with at least one closed round in the window. */
  totalWallets: number;
}

function inWindow(round: SettledRound, window: RankWindow): boolean {
  const at = roundSettledAtMs(round);
  return at >= window.windowStartMs && at < window.windowEndMs;
}

/** pnl, then return on stake, then activity, then the address — the reference's own tie-break order. */
function compare(a: TraderRanking, b: TraderRanking): number {
  if (a.pnlBase !== b.pnlBase) return a.pnlBase < b.pnlBase ? 1 : -1;
  const roiA = a.roiBps ?? Number.NEGATIVE_INFINITY;
  const roiB = b.roiBps ?? Number.NEGATIVE_INFINITY;
  if (roiA !== roiB) return roiB - roiA;
  if (a.tradeCount !== b.tradeCount) return b.tradeCount - a.tradeCount;
  return a.owner.localeCompare(b.owner);
}

function rankOne(owner: Address, rounds: readonly SettledRound[]): TraderRanking | null {
  if (rounds.length === 0) return null;
  const pnlBase = rounds.reduce((sum, round) => sum + round.pnlBase, 0n);
  const volumeBase = rounds.reduce((sum, round) => sum + round.stakeBase, 0n);
  const decided = rounds.filter((round) => round.outcome === "win" || round.outcome === "loss");
  const wins = decided.filter((round) => round.outcome === "win").length;
  return {
    owner,
    pnlBase,
    roiBps: volumeBase > 0n ? Number((pnlBase * BigInt(BPS_DENOMINATOR)) / volumeBase) : null,
    winRatePct: decided.length > 0 ? Math.round((wins / decided.length) * 100) : 0,
    tradeCount: rounds.length,
    settledTrades: decided.length,
    bestStreak: winStreaks(rounds).best,
    volumeBase,
  };
}

/**
 * Ranks every wallet by realised result over the rounds that closed inside the window.
 * A loss is a round like any other: it enters the sum, and it cannot leave it.
 */
export function rankTraders(byWallet: ReadonlyMap<Address, readonly SettledRound[]>, window: RankWindow): RankResult {
  const rankings: TraderRanking[] = [];
  let closedCalls = 0;
  for (const [owner, rounds] of byWallet) {
    const closed = rounds.filter((round) => inWindow(round, window));
    const ranking = rankOne(owner, closed);
    if (!ranking) continue;
    closedCalls += closed.length;
    rankings.push(ranking);
  }
  rankings.sort(compare);
  return { rankings, closedCalls, totalWallets: rankings.length };
}
