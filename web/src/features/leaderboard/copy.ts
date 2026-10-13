/** The leaderboard's words (S5, L-48): Tradash's states (RV-86, flow targets) in Mitoshi's terms. */
export const LEADERBOARD = {
  eyebrow: "Leaderboard",
  title: "Leaderboard",
  lead: "Ranked by what settled. The house is never ranked.",
  sortLabel: "Rank by",
  sorts: [
    { value: "pnl", label: "P&L" },
    { value: "roi", label: "ROI" },
  ] as const,
  periodLabel: "Period",
  periods: [
    { value: "day", label: "Daily" },
    { value: "week", label: "Weekly" },
    { value: "month", label: "Monthly" },
    { value: "all", label: "All time" },
  ] as const,
  podium: "Top three",
  list: "Ranked wallets",
  you: "You",
  /** Win rate is over rounds the settlement decided; a round sold back before the close has no verdict. */
  byline: (rounds: number, settled: number, winPct: number, streak: number) =>
    `${rounds} ${rounds === 1 ? "round" : "rounds"} · ${settled === 0 ? "sold before the close" : `${winPct}% won`}${streak > 1 ? ` · best streak ${streak}` : ""}`,
  summary: (wallets: number, rounds: number) => `${wallets.toLocaleString("en-US")} ranked ${wallets === 1 ? "wallet" : "wallets"} · ${rounds.toLocaleString("en-US")} settled ${rounds === 1 ? "round" : "rounds"}`,
  loading: "Loading…",
  empty: "No ranked traders yet. Close a trade to get on the board.",
  emptyPeriod: "No trades in this period.",
  error: "Couldn't load the leaderboard.",
  retry: "Try again",
  foot: "P&L = paid back − paid in, per Window. ROI = P&L ÷ paid in.",
} as const;
