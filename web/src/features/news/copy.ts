import type { Sentiment } from "./wire";

/** `/news` — Masayume's and Agari's words (Yosuku's own deleted page, `app/news/page.tsx` at 93d09c1^), for Mitoshi. */
export const NEWS = {
  eyebrow: "News",
  heading: "Market",
  headingAccent: "News",
  /** Verbatim from the reference: "headlines that move the market". */
  headingJp: "市場を動かす見出し。",
  intro: "The stories on the coins and stocks Mitoshi lists, newest first, each tagged by the words in its headline. Read the room before you call the close.",
  credit: "Headlines via Finnhub, Cointelegraph and Decrypt; each opens at its publisher.",
  lead: "Latest",
  list: "The wire",
  refreshed: (at: string) => `Read ${at} UTC; refreshed every few minutes.`,
  partial: "One of the sources couldn't be read just now, so this is what the others carry.",
  quiet: "The wire is quiet. Headlines return shortly.",
  reading: "Reading the wire…",
  sentiment: { positive: "bullish", negative: "bearish", neutral: "neutral" } satisfies Record<Sentiment, string>,
  tone: "Tagged from the headline's words, not a market signal.",
  trade: (symbol: string) => `Trade ${symbol}`,
  story: "Story",
} as const;

/** "now", "5m", "2h", "3d" — the reference's `timeAgo`, against a fixed instant so server and client agree. */
export function timeAgo(sec: number, nowMs: number): string {
  const mins = Math.floor((nowMs - sec * 1000) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}
