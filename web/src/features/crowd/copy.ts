export const CROWD = {
  label: "Crowd",
  /** "Crowd on TSLA: 62% of calls' size leaning UP over the last 24 h". */
  aria: (pct: number, side: string, window: string, symbol: string) => `Crowd on ${symbol}: ${pct}% of calls' size leaning ${side} over the last ${window}`,
} as const;
