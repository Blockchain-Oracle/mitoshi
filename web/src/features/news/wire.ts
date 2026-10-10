import "server-only";
/**
 * The wire (S5, L-17: crypto RSS from Masayume + Finnhub equities from Agari). Masayume 68f7a09
 * `app/api/news/route.ts`'s two public RSS feeds (Cointelegraph, Decrypt; no key) for the crypto side, and Agari
 * 4c0278ad `app/api/news/route.ts`'s Finnhub market wire plus company news for every listed stock (`server/finnhub.ts`)
 * for the equities, merged newest first and deduped by title. The sentiment tag is the reference's keyword heuristic
 * over the headline, shown as a labelled reading of the words, not a market signal. Finnhub names the tickers it files
 * a story under; an RSS story is tagged BTC, ETH or SOL only when its headline names the coin. A feed that can't be
 * read is left out and said so (`partial`); with nothing read, the page shows the empty state, never a stale story.
 */
import { STOCK_SYMBOLS, TICKER_SYMBOLS, type TickerSymbol } from "@cwf/core";
import { companyNews, finnhubConfigured, marketNews, type FinnhubArticle } from "@/server/finnhub";

export type Sentiment = "positive" | "negative" | "neutral";

export interface Article {
  title: string;
  source: string;
  url: string;
  publishedAtSec: number;
  sentiment: Sentiment;
  symbols: TickerSymbol[];
}

export interface Wire {
  articles: Article[];
  /** True when a source couldn't be read this time (or Finnhub has no key here): the wire is what the rest said. */
  partial: boolean;
  readAtMs: number;
}

const FEEDS = [
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
] as const;

const POS = /\b(surge|surges|surged|rally|rallies|gain|gains|soar|soars|record|high|highs|bull|bullish|jump|jumps|climb|climbs|rise|rises|adoption|approve|approved|inflows?)\b/i;
const NEG = /\b(crash|crashes|plunge|plunges|drop|drops|fall|falls|hack|hacked|exploit|bear|bearish|loss|losses|sell-?off|liquidat|down|slump|outflows?|ban|lawsuit)\b/i;
const COINS: readonly [TickerSymbol, RegExp][] = [
  ["BTC", /\b(bitcoin|btc)\b/i],
  ["ETH", /\b(ethereum|ether|eth)\b/i],
  ["SOL", /\b(solana|sol)\b/i],
];

const PER_FEED = 15;
const HEADLINES = 30;
const RSS_REVALIDATE_SEC = 300;
const MAX_SYMBOLS = 4;

const sentiment = (title: string): Sentiment => (NEG.test(title) ? "negative" : POS.test(title) ? "positive" : "neutral");
const isTicker = (s: string): s is TickerSymbol => (TICKER_SYMBOLS as readonly string[]).includes(s);

function strip(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseFeed(xml: string, source: string): FinnhubArticle[] {
  const out: FinnhubArticle[] = [];
  for (const block of xml.split("<item>").slice(1, PER_FEED + 1)) {
    const title = strip(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const url = strip(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const pub = Date.parse(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "");
    if (!title || !/^https?:\/\//.test(url) || Number.isNaN(pub)) continue;
    out.push({ title, source, url, publishedAtSec: Math.floor(pub / 1000), symbols: COINS.filter(([, re]) => re.test(title)).map(([s]) => s) });
  }
  return out;
}

async function rss(url: string, source: string): Promise<FinnhubArticle[] | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "MitoshiNewsBot/1.0" }, next: { revalidate: RSS_REVALIDATE_SEC }, signal: AbortSignal.timeout(8_000) });
    return res.ok ? parseFeed(await res.text(), source) : null;
  } catch {
    return null;
  }
}

/** Newest first, one row per title; a story several tickers carry keeps every ticker it was filed under. */
export function merge(feeds: readonly (FinnhubArticle[] | null)[], limit = HEADLINES): Article[] {
  const byTitle = new Map<string, FinnhubArticle>();
  for (const a of feeds.flatMap((f) => f ?? [])) {
    const seen = byTitle.get(a.title);
    if (!seen) byTitle.set(a.title, { ...a, symbols: [...a.symbols] });
    else for (const s of a.symbols) if (!seen.symbols.includes(s)) seen.symbols.push(s);
  }
  return [...byTitle.values()]
    .sort((a, b) => b.publishedAtSec - a.publishedAtSec)
    .slice(0, limit)
    .map((a) => ({ title: a.title, source: a.source, url: a.url, publishedAtSec: a.publishedAtSec, sentiment: sentiment(a.title), symbols: [...new Set(a.symbols.filter(isTicker))].slice(0, MAX_SYMBOLS) }));
}

export async function readWire(): Promise<Wire> {
  const finnhub = finnhubConfigured() ? [marketNews(), ...STOCK_SYMBOLS.map(companyNews)] : [];
  const feeds = await Promise.all([...FEEDS.map((f) => rss(f.url, f.source)), ...finnhub]);
  return { articles: merge(feeds), partial: !finnhubConfigured() || feeds.some((f) => f === null), readAtMs: Date.now() };
}
