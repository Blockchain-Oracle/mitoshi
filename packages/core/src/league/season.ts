// The weekly season league (S13 step 11; D-195, RV-87: Tradash's Bulk Aura becomes a Mitoshi league): points from real
// trades and streaks, one ISO week at a time (Monday 00:00 UTC), and a league by where a wallet's points sit among
// everyone's that week. Pure: the web reads the settled rounds the leaderboard already reads and scores them here.

const DAY_SEC = 86_400;
const WEEK_SEC = 7 * DAY_SEC;
/** 1970-01-01 was a Thursday; the first Monday 00:00 UTC after it. */
const FIRST_MONDAY_SEC = 4 * DAY_SEC;

export const LEAGUE_POINTS = {
  /** Every settled call — a Window closed or held to its close. */
  call: 10,
  /** On top, for a call that made money. */
  win: 5,
  /** For each round in the week's best run of wins. */
  streakRound: 3,
  /** For each UTC day with at least one settled call. */
  activeDay: 5,
  /** Per $10 staked, capped: volume counts, but can't be farmed. */
  perTenDollars: 1,
  volumeCap: 100,
} as const;

export type LeagueCategory = "calls" | "wins" | "streak" | "days" | "volume";
export type LeagueTier = "diamond" | "platinum" | "gold" | "silver" | "bronze";
/** Tier floors as the share of the week's ranked wallets above (top 1 %, 5 %, 15 %, 40 %, everyone else). */
export const LEAGUE_TIERS: readonly { tier: LeagueTier; topPercent: number }[] = [
  { tier: "diamond", topPercent: 1 },
  { tier: "platinum", topPercent: 5 },
  { tier: "gold", topPercent: 15 },
  { tier: "silver", topPercent: 40 },
  { tier: "bronze", topPercent: 100 },
];

export interface SeasonWeek {
  startSec: number;
  endSec: number;
}

export function seasonWeek(nowSec: number): SeasonWeek {
  const startSec = FIRST_MONDAY_SEC + Math.floor((nowSec - FIRST_MONDAY_SEC) / WEEK_SEC) * WEEK_SEC;
  return { startSec, endSec: startSec + WEEK_SEC };
}

export interface LeagueRound {
  /** When it settled (or was closed), unix seconds. */
  atSec: number;
  pnlBase: bigint;
  stakeBase: bigint;
}

export interface LeagueScore {
  points: number;
  categories: { key: LeagueCategory; points: number }[];
}

/** One wallet's points for the week, from its rounds settled inside it. `decimals` is the stake token's. */
export function scoreWeek(rounds: readonly LeagueRound[], week: SeasonWeek, decimals: number): LeagueScore {
  const inWeek = rounds.filter((r) => r.atSec >= week.startSec && r.atSec < week.endSec).sort((a, b) => a.atSec - b.atSec);
  let best = 0;
  let run = 0;
  for (const r of inWeek) {
    if (r.pnlBase > 0n) best = Math.max(best, ++run);
    else if (r.pnlBase < 0n) run = 0;
  }
  const days = new Set(inWeek.map((r) => Math.floor(r.atSec / DAY_SEC))).size;
  const staked = inWeek.reduce((sum, r) => sum + r.stakeBase, 0n);
  const tens = Number(staked / (10n * 10n ** BigInt(decimals)));
  const categories: LeagueScore["categories"] = [
    { key: "calls", points: inWeek.length * LEAGUE_POINTS.call },
    { key: "wins", points: inWeek.filter((r) => r.pnlBase > 0n).length * LEAGUE_POINTS.win },
    { key: "streak", points: best * LEAGUE_POINTS.streakRound },
    { key: "days", points: days * LEAGUE_POINTS.activeDay },
    { key: "volume", points: Math.min(tens * LEAGUE_POINTS.perTenDollars, LEAGUE_POINTS.volumeCap) },
  ];
  const nonZero = categories.filter((c) => c.points > 0).sort((a, b) => b.points - a.points);
  return { points: nonZero.reduce((s, c) => s + c.points, 0), categories: nonZero };
}

export interface Standing {
  /** 1 is the week's top; null with no points. */
  rank: number | null;
  /** Wallets with points this week. */
  of: number;
  /** Share of the week's wallets at or above this one, 0–100; null with no points. */
  topPercent: number | null;
  tier: LeagueTier | null;
}

/** Where `points` sits among the week's scores (ties share the better rank). */
export function standing(points: number, everyone: readonly number[]): Standing {
  const ranked = everyone.filter((p) => p > 0);
  if (points <= 0 || ranked.length === 0) return { rank: null, of: ranked.length, topPercent: null, tier: null };
  const rank = 1 + ranked.filter((p) => p > points).length;
  const topPercent = Math.max(0.1, Math.round((rank / ranked.length) * 1000) / 10);
  return { rank, of: ranked.length, topPercent, tier: LEAGUE_TIERS.find((t) => topPercent <= t.topPercent)!.tier };
}
