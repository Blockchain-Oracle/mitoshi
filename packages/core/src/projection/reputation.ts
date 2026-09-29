// Ported from Masayume 68f7a09:packages/core/src/projection/reputation.ts
/**
 * Reputation tiers, ported from the reference's `predictionContract.ts` (`TIERS`, `computeTier`,
 * `getReputationData`) — the thresholds are the reference's own.
 *
 * What is NOT ported: the reference attaches a "bonus %" and a "fee %" to each tier. No
 * contract here pays a bonus or discounts a fee by tier, so those two numbers would be an
 * invented economy. The tier, the record it rests on and the distance to the next one are all
 * real and are all that is shown.
 */
export type ReputationTier = "Novice" | "Trader" | "Whale" | "Oracle";

export interface ReputationData {
  /** Decided rounds — wins and losses; a void decides nothing. */
  bets: number;
  wins: number;
  streak: number;
  /** 0..1 */
  winRate: number;
  tier: ReputationTier;
  nextTier: ReputationTier | null;
  /** 0..100 toward the next tier; 100 at the top. */
  progressToNext: number;
}

interface TierRule {
  tier: ReputationTier;
  minBets: number;
  minWinRate: number;
}

/** Highest first, as the reference orders them. */
export const REPUTATION_TIERS: readonly TierRule[] = [
  { tier: "Oracle", minBets: 30, minWinRate: 0.65 },
  { tier: "Whale", minBets: 15, minWinRate: 0.55 },
  { tier: "Trader", minBets: 5, minWinRate: 0.45 },
  { tier: "Novice", minBets: 0, minWinRate: 0 },
];

export function computeTier(bets: number, wins: number): ReputationTier {
  const winRate = bets > 0 ? wins / bets : 0;
  for (const rule of REPUTATION_TIERS) if (bets >= rule.minBets && winRate >= rule.minWinRate) return rule.tier;
  return "Novice";
}

export function reputationOf(bets: number, wins: number, streak: number): ReputationData {
  const winRate = bets > 0 ? wins / bets : 0;
  const tier = computeTier(bets, wins);
  const index = REPUTATION_TIERS.findIndex((rule) => rule.tier === tier);
  const next = index > 0 ? REPUTATION_TIERS[index - 1]! : null;

  let progressToNext = 100;
  if (next) {
    const betsProgress = Math.min(1, bets / next.minBets);
    const rateProgress = next.minWinRate > 0 ? Math.min(1, winRate / next.minWinRate) : 1;
    progressToNext = Math.round(((betsProgress + rateProgress) / 2) * 100);
  }
  return { bets, wins, streak, winRate, tier, nextTier: next?.tier ?? null, progressToNext };
}
