import type { EdgeWindow } from "@cwf/core";

/** `/portfolio/edge` — ported from Masayume 68f7a09:web/src/features/edge/copy.ts (Yosuku's Trader Edge), for Mitoshi. */
export const EDGE = {
  back: "Portfolio",
  intro: {
    eyebrow: "Trader Edge",
    title: "Know your edge.",
    lede: "What pays, what costs, when you trade best.",
  },
  states: {
    connect: {
      eyebrow: "Your record",
      title: "See the trader your history reveals.",
      copy: "Sign in. The report builds from your fills.",
      action: "Sign in",
    },
    reading: "Reading your trading history",
    failed: { eyebrow: "Couldn't read your history", title: "Your history is still on chain.", copy: "Nothing changed. Try again in a moment.", retry: "Try again" },
    none: {
      eyebrow: "No settled Windows yet",
      title: "Your edge starts after the close.",
      open: (n: number) => `${n} open ${n === 1 ? "Window is" : "Windows are"} still waiting to settle.`,
      first: "Make a call, let its Window settle, and this report builds itself from your account.",
      action: "Make a call",
    },
    partial: "This account has more history than one reading can page; the report covers its most recent part.",
  },
  report: {
    netLabel: "Net result",
    roi: (pct: string) => `${pct}% return on settled stake`,
    roiUnavailable: "Return unavailable",
    sample: (settled: number, open: number) => `${settled} settled · ${open} open`,
    readoutLabel: "Mitoshi readout",
    readoutFoot: "A record, not a forecast.",
    readout: {
      moreRounds: (needed: number) => `${needed} more settled ${needed === 1 ? "Window" : "Windows"} will reveal your first useful pattern.`,
      bestWindow: (label: string, net: string, count: number) => `${label} is your strongest time so far: ${net} across ${count} settled ${count === 1 ? "Window" : "Windows"}.`,
      profitFactor: (factor: string) => `Your winning Windows return $${factor} for every $1 lost.`,
      drawdown: (slide: string) => `Your deepest slide is ${slide}. Smaller stakes would shrink the part of your record doing the most damage.`,
      flat: "Your record is close to flat. More settled Windows will make the signal clearer.",
    },
    metrics: {
      label: "Performance",
      winRate: { label: "Winning Windows", note: (wins: number, losses: number) => `${wins} won, ${losses} lost`, unset: "Not set" },
      profitFactor: { label: "Profit factor", note: "gross profit divided by gross loss", noLoss: "No loss" },
      expectancy: { label: "Average Window", note: "your current expectancy", unset: "Not set" },
      drawdown: { label: "Deepest slide", note: "from peak to trough" },
    },
    windows: {
      title: "When you perform best",
      copy: "By your local time.",
      unreadable: "Close times couldn't be read for this history. Your totals above are still complete.",
      labels: {
        "late-night": { label: "Late night", range: "00:00–05:59" },
        morning: { label: "Morning", range: "06:00–11:59" },
        afternoon: { label: "Afternoon", range: "12:00–17:59" },
        evening: { label: "Evening", range: "18:00–23:59" },
      } satisfies Record<EdgeWindow["key"], { label: string; range: string }>,
      none: "No Windows",
      rounds: (n: number) => `${n} ${n === 1 ? "Window" : "Windows"}`,
    },
    payoff: {
      title: "Your payoff shape",
      averageWin: "Average win",
      averageLoss: "Average loss",
      bestRun: "Best run",
      runs: (n: number) => `${n} ${n === 1 ? "win" : "wins"} in a row`,
      fees: "Settlement fees",
      stake: "Settled stake",
      noWins: "No wins yet",
      noLosses: "No losses yet",
      provenanceLabel: "How this is verified",
      provenance: "Computed in your browser from your fills. Every Window has a proof page.",
      source: { label: "Source", value: "Mitoshi's engine on Tempo testnet" },
      method: { label: "Method", value: "Your fills and the settlement rule" },
    },
  },
} as const;
