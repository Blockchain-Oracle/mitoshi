/** The leaderboard's wire shape (S5, `GET /api/leaderboard`): base units travel as decimal strings, never floats. */
export const PERIODS = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, all: Number.POSITIVE_INFINITY } as const;
export type Period = keyof typeof PERIODS;
/** `streak` orders by the best run of settled wins (the games' Rank page, R4-9, D-227), then P&L. */
export type BoardSort = "pnl" | "roi" | "streak";

export interface BoardRow {
  rank: number;
  owner: string;
  pnlBase: string;
  roiBps: number | null;
  winRatePct: number;
  tradeCount: number;
  settledTrades: number;
  bestStreak: number;
  volumeBase: string;
}

export interface BoardPayload {
  period: Period;
  sort: BoardSort;
  computedAtMs: number;
  /** Rounds that settled in the period across every ranked wallet, and how many wallets that is. */
  closedCalls: number;
  totalWallets: number;
  rankings: BoardRow[];
  /** The asking wallet's own row when it isn't in the top rows (null when it has no round in the period). */
  you: BoardRow | null;
}
