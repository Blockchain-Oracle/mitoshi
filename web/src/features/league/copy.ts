// The season league's words (S13 step 11; D-195, RV-87 — Tradash's Bulk Aura, re-implemented in Mitoshi's voice).
import type { LeagueCategory, LeagueTier } from "@cwf/core/league";

export const LEAGUE = {
  title: "Season league",
  points: "Season points",
  rank: "Rank",
  percentile: "Percentile",
  unranked: "Unranked",
  rankOf: (rank: number, of: number) => `#${rank.toLocaleString("en-US")} of ${of.toLocaleString("en-US")}`,
  top: (pct: number) => `Top ${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`,
  tier: { diamond: "Diamond", platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" } satisfies Record<LeagueTier, string>,
  league: (tier: string) => `${tier} league`,
  week: (start: string, left: string) => `Week of ${start} · resets in ${left}`,
  earnedFrom: "Earned from",
  category: { calls: "Settled calls", wins: "Calls won", streak: "Best winning run", days: "Days you traded", volume: "Volume" } satisfies Record<LeagueCategory, string>,
  how: "How points work",
  rules: [
    "10 for every call that settles or that you close",
    "5 more for each call that made money",
    "3 for each call in your best winning run this week",
    "5 for each day you traded",
    "1 per $10 staked, up to 100 a week",
  ],
  rulesNote: "Leagues by where your points sit this week: Diamond top 1%, Platinum 5%, Gold 15%, Silver 40%, Bronze everyone else with points. The season resets every Monday 00:00 UTC.",
  empty: "No points yet this week. Every call that settles earns them, and the season resets each Monday.",
  signedOut: "Sign in to see your season.",
  loading: "Reading your season…",
  error: "Couldn't load your season.",
  retry: "Try again",
} as const;
