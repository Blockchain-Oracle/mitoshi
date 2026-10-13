import type { Sentiment } from "./wire";

/** `/news` (R4-10, D-227: at Owarine's counts) — Masayume's and Agari's words (Yosuku's own deleted page, `app/news/page.tsx` at 93d09c1^), for Mitoshi. */
export const NEWS = {
  live: "Updated live",
  heading: "Market",
  headingAccent: "News",
  /** Verbatim from the reference: "headlines that move the market". */
  headingJp: "市場を動かす見出し。",
  credit: "Headlines via Finnhub, Cointelegraph and Decrypt.",
  partial: "One source didn't answer.",
  quiet: "The wire is quiet. Headlines return shortly.",
  reading: "Reading the wire…",
  sentiment: { positive: "bullish", negative: "bearish", neutral: "neutral" } satisfies Record<Sentiment, string>,
  trade: "Trade it →",
  all: "All",
  tickers: "Narrow the wire",
} as const;

/** "now", "5m", "2h", "3d" — the reference's `timeAgo`, against a fixed instant so server and client agree. */
export function timeAgo(sec: number, nowMs: number): string {
  const mins = Math.floor((nowMs - sec * 1000) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}
