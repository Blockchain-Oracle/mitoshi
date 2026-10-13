import "server-only";
/**
 * The ticker hub's request-time reads (R4-10, D-227): its headlines — Finnhub's company wire for a stock, the crypto
 * feeds' stories naming the coin for a coin — and its newest calls from Mitoshi's index (`readTickerCalls`, the same
 * sides `/stats` counts, narrowed to the ticker's Windows). Each is null when its source can't be read; nothing is
 * filled in.
 */
import { isStockSymbol, type TickerSymbol } from "@cwf/core";
import { readTickerCalls, type TractionCall } from "@cwf/db/idx";
import { merge, readCoinWire, type Article } from "@/features/news/wire";
import { db } from "@/server/db";
import { demandAddresses } from "@/server/demand";
import { companyNews, finnhubConfigured } from "@/server/finnhub";

const HEADLINES = 8;
const CALLS = 12;

export interface HubHeadlines {
  articles: Article[] | null;
  /** A stock's wire needs a Finnhub key on this deployment: the section says so instead of showing nothing. */
  off: boolean;
}

export async function hubHeadlines(symbol: TickerSymbol): Promise<HubHeadlines> {
  if (!isStockSymbol(symbol)) return { articles: await readCoinWire(symbol, HEADLINES), off: false };
  if (!finnhubConfigured()) return { articles: null, off: true };
  const feed = await companyNews(symbol);
  return { articles: feed === null ? null : merge([feed], HEADLINES), off: false };
}

export async function hubCalls(symbol: TickerSymbol): Promise<TractionCall[] | null> {
  try {
    return await readTickerCalls(db(), { ...demandAddresses(), symbol, limit: CALLS });
  } catch {
    return null;
  }
}
