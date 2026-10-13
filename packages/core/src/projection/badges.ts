// Ported from Masayume 68f7a09:packages/core/src/projection/badges.ts
import { oneUnit } from "../units/decimals";

export type BadgeId = "first_trade" | "winning_streak" | "lp_provider" | "whale" | "oracle";

export interface Badge {
  id: BadgeId;
  earned: boolean;
  /** Set when the badge's source is a capability that is not connected yet; it stays locked and says why. */
  pending: "earn" | null;
  /** How far along it is (R6 money, S20: "2 of 3"), capped at `need`; absent where a badge has no count (LP). */
  progress?: { have: number; need: number };
}

export interface BadgeInput {
  fillCount: number;
  currentWinStreak: number;
  /** Everything ever staked, base units. */
  stakeBase: bigint;
  decidedRounds: number;
  /** 0..1 */
  winRate: number;
  decimals: number;
  /** The wallet's maker-vault shares; null where no vault is deployed on this network. */
  lpSharesRaw: bigint | null;
}

/** The reference's thresholds (`lib/badges.ts`): a 3-win run, 1,000 units traded, 70% over ten decided rounds. */
export const BADGE_RULES = {
  streak: 3,
  whaleUnits: 1_000n,
  oracleWinRate: 0.7,
  oracleRounds: 10,
} as const;

/**
 * Five badges, in the reference's order. "LP Provider" is the reference's `plpBalance > 0` on the maker vault's
 * shares (`lib/badges.ts` L48–52); where no vault is deployed it stays locked with its dependency named rather
 * than dropped, because a missing badge looks like a badge you failed to earn.
 */
export function computeBadges(input: BadgeInput): Badge[] {
  const one = oneUnit(input.decimals);
  const whaleFloor = BADGE_RULES.whaleUnits * one;
  const of = (have: number, need: number) => ({ have: Math.max(0, Math.min(have, need)), need });
  const dollars = input.stakeBase > 0n ? input.stakeBase / one : 0n;
  return [
    { id: "first_trade", earned: input.fillCount > 0, pending: null, progress: of(input.fillCount, 1) },
    { id: "winning_streak", earned: input.currentWinStreak >= BADGE_RULES.streak, pending: null, progress: of(input.currentWinStreak, BADGE_RULES.streak) },
    { id: "lp_provider", earned: (input.lpSharesRaw ?? 0n) > 0n, pending: input.lpSharesRaw === null ? "earn" : null },
    { id: "whale", earned: input.stakeBase >= whaleFloor, pending: null, progress: of(Number(dollars > BADGE_RULES.whaleUnits ? BADGE_RULES.whaleUnits : dollars), Number(BADGE_RULES.whaleUnits)) },
    {
      id: "oracle",
      earned: input.decidedRounds >= BADGE_RULES.oracleRounds && input.winRate >= BADGE_RULES.oracleWinRate,
      pending: null,
      progress: of(input.decidedRounds, BADGE_RULES.oracleRounds),
    },
  ];
}

/** The badge to chase next: the unearned, connected badge furthest along (have / need), the earlier on a tie; null when none. */
export function nextBadge(badges: readonly Badge[]): Badge | null {
  let best: Badge | null = null;
  for (const b of badges) {
    if (b.earned || b.pending !== null || !b.progress) continue;
    if (!best || b.progress.have / b.progress.need > best.progress!.have / best.progress!.need) best = b;
  }
  return best;
}
