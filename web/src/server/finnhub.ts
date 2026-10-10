import "server-only";
// Ported from Agari 4c0278ad:web/src/lib/finnhub.server.ts (market and company news; the earnings calendar is ops'
// `earnings` actor here, so that half stays in Agari).
/**
 * Finnhub, server-only: the market wire and company news for our listed tickers (L-17).
 *
 * - **Key:** `FINNHUB_API_KEY`, sent as the `X-Finnhub-Token` header so it never sits in a URL. Nothing here logs or
 *   returns it; every failure collapses to `null`.
 * - **Budget:** the free key's 60 calls/min is shared with ops (calendar, halts, earnings), so the web keeps to 10
 *   calls in any 60 s, counted once per process. Over budget, a read serves what it last fetched, or `null`; it never
 *   waits.
 * - **Cache:** in memory per instance, with in-flight reads shared, so a burst of requests costs one call each.
 */
import { z } from "zod";

export interface FinnhubArticle {
  title: string;
  source: string;
  url: string;
  publishedAtSec: number;
  symbols: string[];
}

const BASE_URL = "https://finnhub.io/api/v1";
const CALLS_PER_WINDOW = 10;
const WINDOW_MS = 60_000;
const TIMEOUT_MS = 8_000;
const MARKET_NEWS_TTL_MS = 300_000;
const COMPANY_NEWS_TTL_MS = 900_000;
/** How long a last good read may stand in for a failed or over-budget refresh. */
const STALE_LIMIT_MS = { market: 3_600_000, company: 7_200_000 } as const;
const COMPANY_LOOKBACK_SEC = 2 * 86_400;
/** Rows kept per feed: the wire shows a few dozen at most, so this bounds memory. */
const KEEP_ARTICLES = 30;

interface Entry<T> {
  value: T;
  fetchedAtMs: number;
}
interface ClientState {
  callsAtMs: number[];
  cache: Map<string, Entry<unknown>>;
  inFlight: Map<string, Promise<unknown>>;
}

// One budget and one cache per process, even when several route bundles each load their own copy of this module.
const STATE_KEY = Symbol.for("mitoshi.finnhub.client");
const globalStore = globalThis as typeof globalThis & { [STATE_KEY]?: ClientState };
const state: ClientState = (globalStore[STATE_KEY] ??= { callsAtMs: [], cache: new Map(), inFlight: new Map() });

function apiKey(): string | null {
  const key = process.env.FINNHUB_API_KEY?.trim();
  return key ? key : null;
}

export function finnhubConfigured(): boolean {
  return apiKey() !== null;
}

/** Spends one call from the shared 60 s window, or says there is none left. */
function takeCall(nowMs: number): boolean {
  state.callsAtMs = state.callsAtMs.filter((atMs) => nowMs - atMs < WINDOW_MS);
  if (state.callsAtMs.length >= CALLS_PER_WINDOW) return false;
  state.callsAtMs.push(nowMs);
  return true;
}

async function getJson(path: string, params: Record<string, string>): Promise<unknown> {
  const key = apiKey();
  if (!key) return null;
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  try {
    const response = await fetch(url, { headers: { "X-Finnhub-Token": key }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * A cached read: fresh → the cache; otherwise one budgeted call. A failed or unaffordable refresh falls back to the
 * last good value while it is younger than `staleLimitMs`, then to `null`.
 */
function cachedRead<T>(cacheKey: string, ttlMs: number, staleLimitMs: number, load: () => Promise<T | null>): Promise<T | null> {
  if (!finnhubConfigured()) return Promise.resolve(null);
  const nowMs = Date.now();
  const entry = state.cache.get(cacheKey) as Entry<T> | undefined;
  if (entry && nowMs - entry.fetchedAtMs < ttlMs) return Promise.resolve(entry.value);
  const fallback = entry && nowMs - entry.fetchedAtMs < staleLimitMs ? entry.value : null;
  const pending = state.inFlight.get(cacheKey) as Promise<T | null> | undefined;
  if (pending) return pending;
  if (!takeCall(nowMs)) return Promise.resolve(fallback);
  const read = load()
    .catch(() => null)
    .then((value) => {
      if (value === null) return fallback;
      state.cache.set(cacheKey, { value, fetchedAtMs: Date.now() });
      return value;
    })
    .finally(() => state.inFlight.delete(cacheKey));
  state.inFlight.set(cacheKey, read);
  return read;
}

const rawArticleSchema = z.object({ headline: z.string(), source: z.string(), url: z.string(), datetime: z.number(), related: z.string().nullish() });

/** Finnhub rows → articles, newest first. A malformed row is dropped, not the feed. */
function toArticles(body: unknown, sinceSec = 0): FinnhubArticle[] | null {
  if (!Array.isArray(body)) return null;
  const articles: FinnhubArticle[] = [];
  for (const row of body) {
    const parsed = rawArticleSchema.safeParse(row);
    if (!parsed.success) continue;
    const { headline, source, url, datetime, related } = parsed.data;
    const publishedAtSec = Math.floor(datetime);
    if (!headline.trim() || !/^https?:\/\//.test(url) || publishedAtSec < sinceSec) continue;
    const symbols = (related ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    articles.push({ title: headline.trim(), source: source.trim(), url, publishedAtSec, symbols });
  }
  return articles.sort((a, b) => b.publishedAtSec - a.publishedAtSec).slice(0, KEEP_ARTICLES);
}

/** `news?category=general`: the market-wide wire (Reuters, CNBC, Bloomberg). Cached 300 s. */
export function marketNews(): Promise<FinnhubArticle[] | null> {
  return cachedRead("news:general", MARKET_NEWS_TTL_MS, STALE_LIMIT_MS.market, async () => toArticles(await getJson("news", { category: "general" })));
}

const utcDate = (sec: number): string => new Date(sec * 1000).toISOString().slice(0, 10);

/** `company-news` for one ticker over the last 48 h. Cached 900 s. */
export function companyNews(symbol: string): Promise<FinnhubArticle[] | null> {
  return cachedRead(`news:company:${symbol}`, COMPANY_NEWS_TTL_MS, STALE_LIMIT_MS.company, async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const sinceSec = nowSec - COMPANY_LOOKBACK_SEC;
    return toArticles(await getJson("company-news", { symbol, from: utcDate(sinceSec), to: utcDate(nowSec) }), sinceSec);
  });
}
