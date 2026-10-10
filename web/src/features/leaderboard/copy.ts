/** The leaderboard's words (S5, L-48): Tradash's states (RV-86, flow targets) in Mitoshi's terms. */
export const LEADERBOARD = {
  eyebrow: "Leaderboard",
  title: "Ranked by what settled",
  lead: "Every wallet's settled rounds on Tempo testnet, from the engine's own records: what it paid in, what it sold back, and what the settlement paid. The house is never ranked.",
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
  byline: (rounds: number, winPct: number, streak: number) => `${rounds} ${rounds === 1 ? "round" : "rounds"} · ${winPct}% won${streak > 1 ? ` · best streak ${streak}` : ""}`,
  summary: (wallets: number, rounds: number) => `${wallets.toLocaleString("en-US")} ranked ${wallets === 1 ? "wallet" : "wallets"} · ${rounds.toLocaleString("en-US")} settled ${rounds === 1 ? "round" : "rounds"}`,
  loading: "Loading…",
  empty: "No ranked traders yet. Close a trade to get on the board.",
  emptyPeriod: "No trades in this period.",
  error: "Couldn't load the leaderboard.",
  retry: "Try again",
  foot: "A round is one wallet in one Window: P&L is what came back (sold before the close, plus the settlement's payout on what was held) less what went in. ROI is P&L over what went in. A Trading Balance tap counts for its owner. Boost, Parlay, Range and private tickets aren't ranked yet.",
} as const;
