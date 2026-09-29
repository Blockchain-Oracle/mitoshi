// Ported from Masayume 68f7a09:packages/core/src/games/season.ts
/**
 * A season's prize programme, as rules — Flicky's `season.ts` and `env.ts` §Season, in one place.
 *
 * The reference configures a season in the environment (an id, a name, an end, a prize split, an
 * eligibility floor) and derives everything shown from it: the headline pool is the SUM of the split, so
 * the number and the breakdown cannot drift; a rank's prize is looked up in the split; a player is
 * eligible once they have finished enough staked duels. Nothing here reads a chain or a database — the
 * pool's on-chain balance and the ladder are the callers' to fetch — so the same rules price the rank
 * page, the API and the operator's payout tools identically.
 */

/** Ranks `rankStart..rankEnd` (inclusive, 1-based) each pay `amountUnits` whole units of the prize currency. */
export interface PrizeTier {
  rankStart: number;
  rankEnd: number;
  amountUnits: number;
}

export interface SeasonConfig {
  id: string;
  name: string;
  /** ISO instant the season ends — the countdown's target. Informational: payout timing is the admin's. */
  endsAt: string;
  prizeSplit: readonly PrizeTier[];
  /** Completed ranked duels a player needs before a prize is theirs to win. */
  minStakedDuels: number;
  eligibilityNote: string;
}

/** The reference's shape, in the venue's money: 1st 40 / 2nd 20 / 3rd 10 / 4th–9th 5 each — 100 in all. */
export const DEFAULT_PRIZE_SPLIT: readonly PrizeTier[] = [
  { rankStart: 1, rankEnd: 1, amountUnits: 40 },
  { rankStart: 2, rankEnd: 2, amountUnits: 20 },
  { rankStart: 3, rankEnd: 3, amountUnits: 10 },
  { rankStart: 4, rankEnd: 9, amountUnits: 5 },
];

/**
 * `start:end:amount,start:end:amount,…` — the reference's `SEASON_PRIZE_SPLIT`. A malformed segment throws
 * rather than mis-pricing a prize quietly; an absent value is the default split.
 */
export function parsePrizeSplit(raw: string | undefined | null, fallback: readonly PrizeTier[] = DEFAULT_PRIZE_SPLIT): readonly PrizeTier[] {
  if (!raw || !raw.trim()) return fallback;
  return raw.split(",").map((segment) => {
    const parts = segment.trim().split(":").map(Number);
    const [rankStart, rankEnd, amountUnits] = parts;
    if (parts.length !== 3 || rankStart === undefined || rankEnd === undefined || amountUnits === undefined || !parts.every(Number.isFinite)) {
      throw new Error(`bad prize split segment "${segment}" — want start:end:amount (e.g. 1:1:40,4:9:5)`);
    }
    if (!Number.isInteger(rankStart) || !Number.isInteger(rankEnd) || rankStart < 1 || rankEnd < rankStart || amountUnits < 0) {
      throw new Error(`bad prize split segment "${segment}" — ranks are 1-based and ordered, amounts non-negative`);
    }
    return { rankStart, rankEnd, amountUnits };
  });
}

/** The headline pool: the sum of every rank's prize. Derived, never a separate number. */
export function prizePoolTotalUnits(split: readonly PrizeTier[]): number {
  return split.reduce((sum, tier) => sum + tier.amountUnits * (tier.rankEnd - tier.rankStart + 1), 0);
}

/** The prize a 1-based position wins, or null when that rank wins nothing. */
export function prizeForRank(split: readonly PrizeTier[], position: number): number | null {
  for (const tier of split) {
    if (position >= tier.rankStart && position <= tier.rankEnd) return tier.amountUnits;
  }
  return null;
}

/** The deepest rank the split pays. */
export function lastPaidRank(split: readonly PrizeTier[]): number {
  return split.reduce((deepest, tier) => Math.max(deepest, tier.rankEnd), 0);
}

export function isEligible(stakedDuels: number, minStakedDuels: number): boolean {
  return stakedDuels >= minStakedDuels;
}

export interface SeasonStanding {
  wallet: string;
  rating: number;
  stakedDuels: number;
}

export interface SeasonWinner {
  rank: number;
  wallet: string;
  rating: number;
  amountUnits: number;
}

/**
 * Who is paid, and how much — the reference's `season:results` rule. Players are taken in ladder order,
 * the ineligible are skipped rather than paid, the split is walked down the eligible list, and a rank
 * that pays nothing is not a winner. `standings` must already be in rating order.
 */
export function seasonWinners(standings: readonly SeasonStanding[], split: readonly PrizeTier[], minStakedDuels: number): readonly SeasonWinner[] {
  const eligible = standings.filter((row) => isEligible(row.stakedDuels, minStakedDuels));
  const out: SeasonWinner[] = [];
  for (const [index, row] of eligible.slice(0, lastPaidRank(split)).entries()) {
    const rank = index + 1;
    const amountUnits = prizeForRank(split, rank);
    if (amountUnits !== null && amountUnits > 0) out.push({ rank, wallet: row.wallet, rating: row.rating, amountUnits });
  }
  return out;
}

/**
 * The operator's season from a plain environment — `SEASON_ID` names one; without it there is no season
 * and no prize is invented. A malformed split or end throws at the first read rather than mis-pricing.
 */
export function seasonConfigFrom(env: Readonly<Record<string, string | undefined>>): SeasonConfig | null {
  const id = env.SEASON_ID?.trim();
  if (!id) return null;
  const endsAt = env.SEASON_ENDS_AT?.trim();
  if (!endsAt || Number.isNaN(Date.parse(endsAt))) throw new Error("SEASON_ENDS_AT must be an ISO instant when SEASON_ID is set");
  const min = Number(env.SEASON_MIN_STAKED_DUELS ?? 1);
  return {
    id,
    name: env.SEASON_NAME?.trim() || id,
    endsAt: new Date(endsAt).toISOString(),
    prizeSplit: parsePrizeSplit(env.SEASON_PRIZE_SPLIT),
    minStakedDuels: Number.isInteger(min) && min >= 0 ? min : 1,
    eligibilityNote: env.SEASON_ELIGIBILITY_NOTE?.trim() || "Paid from the pool at season end, in the ladder's order.",
  };
}

/** Flicky's `fmtCountdown`, with days: `26d 3h`, then `2h 47m`, then `47:12`, then `now`. */
export function formatSeasonCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Milliseconds until the season ends, floored at zero. */
export function seasonRemainingMs(config: Pick<SeasonConfig, "endsAt">, nowMs: number): number {
  return Math.max(0, Date.parse(config.endsAt) - nowMs);
}
