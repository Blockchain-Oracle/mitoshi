/** The share modal's words (S5 L-22, S23g RV-83): Owarine ecb7565b's share sheet and Tradash's post tiers, for Mitoshi. */
export const SHARE = {
  title: { open: "Share position", closed: "Share trade" },
  modeLabel: "Show",
  modes: [
    { value: "pnl", label: "PnL" },
    { value: "roi", label: "ROI" },
    { value: "both", label: "Both" },
  ] as const,
  preview: (call: string, result: string) => `Share card: ${call}, ${result}`,
  drawing: "Drawing the card…",
  drawFailed: "Couldn't draw the card.",
  retry: "Try again",
  download: { idle: "Download", preparing: "Preparing…", saving: "Saving…", retry: "Retry" },
  onX: "Share on X",
  masked: "Amounts are hidden. Show them (the eye in the top line) to share this card.",
  /** Tradash's post tiers, in dollars. */
  post: (asset: string, side: "up" | "down", pnl: string, roiPct: number, positive: boolean) => {
    const dir = side === "up" ? "Up" : "Down";
    if (roiPct >= 100) return `+${Math.round(roiPct)}% ${dir} on ${asset} on Mitoshi. let it ride`;
    if (roiPct >= 25) return `+${Math.round(roiPct)}% on ${asset} (${pnl}) on Mitoshi. green day`;
    if (positive) return `${pnl} on ${asset} on Mitoshi. up only`;
    if (roiPct <= -50) return `${Math.round(roiPct)}% on ${asset} on Mitoshi. rough one, on to the next`;
    return `${pnl} on ${asset} on Mitoshi. taking the L, moving on`;
  },
} as const;
