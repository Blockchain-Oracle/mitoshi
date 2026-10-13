// Reputation and badges from a record's counts (L-49): shared by Trader Edge (the reader's own history, in the browser)
// and the profile (any wallet's, read on the server). Pure, so either side can call it.
import { computeBadges, reputationOf, type Badge, type ReputationData } from "@cwf/core";

/**
 * The tier and the five badges for a record. `lpSharesRaw` is the account's maker-vault shares where the caller reads
 * them (/portfolio, R4-4 — Earn is live since R4-7); left out (a profile read on the server), the LP badge names Earn.
 */
export function recordOf(input: { wins: number; losses: number; currentWinStreak: number; fillCount: number; stakeBase: bigint; decimals: number; lpSharesRaw?: bigint | null }): { reputation: ReputationData; badges: Badge[] } {
  const decided = input.wins + input.losses;
  return {
    reputation: reputationOf(decided, input.wins, input.currentWinStreak),
    // `lpSharesRaw: null` → the LP badge stays locked and names what it waits on (Masayume's own rule for no vault).
    badges: computeBadges({ fillCount: input.fillCount, currentWinStreak: input.currentWinStreak, stakeBase: input.stakeBase, decidedRounds: decided, winRate: decided ? input.wins / decided : 0, decimals: input.decimals, lpSharesRaw: input.lpSharesRaw ?? null }),
  };
}

