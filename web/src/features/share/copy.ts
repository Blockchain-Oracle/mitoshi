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
  /** R4-13a (D-227): the eye is hidden on phones, so the sheet carries its own "Show" (bug 14). */
  masked: "Amounts are hidden.",
  show: "Show",
  /** The Share pill on a call, a verdict and a receipt (R4-13a, Owarine's ShareCallButton / ShareTradeButton). */
  pill: "Share",
  rendering: "Drawing…",
  savedAttach: "Card saved. Attach it to your post on X",
  renderFailed: "Couldn't draw the card.",
  /** The pre-filled posts: real figures only; a call is framed as live, a verdict names its signed close. */
  callPost: (band: string, cadence: string, stake: string, toWin: string, closes: string) => `My call: ${band.toLowerCase()}${cadence ? ` (${cadence} Window)` : ""}. Staked ${stake} to win ${toWin}, settles ${closes} on Tempo. Will it land?`,
  signedBy: (who: string) => `Signed by ${who}`,
  /** An arcade run's post (Ported from Senryo:features/games/arcade/ArcadeScreen.tsx's share line). */
  scorePost: (score: string, game: string) => `I scored ${score} on ${game} at Mitoshi. Beat it:`,
  verdictPost: (call: string, outcome: "win" | "loss" | "void") => `${call}: ${outcome === "win" ? "won" : outcome === "loss" ? "lost" : "voided, stake returned"} on Mitoshi. Signed close, checkable:`,
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
