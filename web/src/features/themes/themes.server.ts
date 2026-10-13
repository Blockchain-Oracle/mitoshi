import "server-only";
/**
 * `/themes*`'s server reads (R6, D-230; D-231 on baskets). A theme is a `basket` strategy on the StrategyRegistry, so the
 * catalogue is the strategies desk's own cached read of the index (`readStrategies`, shared with /agents) filtered to
 * baskets, and a theme's page its detail read (calls, record) kept 30 s; the weighted mix is ops' display candles
 * (`/prices/candles`, 5 min), and whether a market-hours theme is calling now is ops' session clock (`/session`, 30 s).
 * Each is `use cache` under the themes tag a confirmed follow or publish expires (`/api/themes/revalidate`), read in
 * parallel, and streamed where it isn't the page's first paint. A failed read throws inside the cache — so a failure is
 * never what it keeps — and answers null outside it: the page says so rather than show a made-up value.
 */
import { basketStocks, isBasket, type BasketSpec, type StockSymbol } from "@cwf/core";
import { cacheLife, cacheTag } from "next/cache";
import { readStrategies, readStrategyDetail, STRATEGIES_CACHE_TAG } from "@/features/strategies/strategies.server";
import type { StrategyDetailPayload } from "@/features/strategies/protocol";
import { webEnv } from "@/lib/env";
import { CANDLE_COUNT, MIX_RANGES, mixByRange, mixMoveBps, mixSeries, rangeStart, thinPoints, weightedPrice, type Candle, type MixInterval, type MixLine, type MixMember, type MixSeries } from "./mix";
import { clockOf, type MarketClock } from "./status";
import type { CardMix, ThemeCalls, ThemeWire } from "./wire";

export const THEMES_CACHE_TAG = "themes";
const DETAIL_LIFE = { stale: 30, revalidate: 30, expire: 3_600 };
const CANDLE_LIFE = { stale: 300, revalidate: 300, expire: 86_400 };
const CLOCK_LIFE = { stale: 30, revalidate: 30, expire: 600 };
const OPS_TIMEOUT_MS = 8_000;
const CALLS_SHOWN = 20;
/** Points drawn per line: a card's spark, a page's chart (the readout reads the same points). */
const CARD_POINTS = 64;
const CHART_POINTS = 180;
const WEEK_DAYS = 7;

const fail = (why: string): never => {
  throw new Error(why);
};
const opsBase = () => webEnv.markets.opsUrl?.replace(/\/+$/, "") || null;
const membersOf = (spec: BasketSpec): MixMember[] => spec.members.map((m) => ({ symbol: m.symbol, weightBps: m.weightBps }));

export interface Catalogue {
  themes: ThemeWire[];
  houseRunner: string | null;
}

/** Every theme open to followers, newest first; null when the index can't be read. */
export async function themesCatalogue(): Promise<Catalogue | null> {
  try {
    const p = await readStrategies();
    const themes = p.strategies.flatMap((card) => (isBasket(card.spec) && card.active ? [{ card, spec: card.spec }] : [])).sort((a, b) => Number(b.card.strategyId) - Number(a.card.strategyId));
    return { themes, houseRunner: p.houseRunner };
  } catch {
    return null;
  }
}

async function detailRead(id: string): Promise<StrategyDetailPayload | null> {
  "use cache";
  cacheLife(DETAIL_LIFE);
  cacheTag(THEMES_CACHE_TAG, STRATEGIES_CACHE_TAG);
  return readStrategyDetail(id);
}

export type ThemeRead = { kind: "theme"; theme: ThemeWire; calls: ThemeCalls } | { kind: "strategy" } | { kind: "missing" };

/** One theme with its latest calls; "strategy" when the id is a strategy that isn't a basket; null when unread. */
export async function themeById(id: string): Promise<ThemeRead | null> {
  try {
    const d = await detailRead(id);
    if (!d) return { kind: "missing" };
    const card = d.strategy;
    if (!isBasket(card.spec)) return { kind: "strategy" };
    const calls = d.decisions.filter((x) => x.side !== null && x.gate === "trade");
    return { kind: "theme", theme: { card, spec: card.spec }, calls: { calls: calls.slice(0, CALLS_SHOWN).map(({ receipts: _r, ...c }) => c), total: card.decisions.bets } };
  } catch {
    return null;
  }
}

const isCandle = (c: unknown): c is Candle => Array.isArray(c) && c.length >= 5 && c.every((x) => typeof x === "number" && Number.isFinite(x));

/** A stock's candles; null when ops doesn't list it (a real answer, kept). A 5xx, a 429 or no answer throws. */
async function candlesRead(symbol: string, interval: MixInterval): Promise<Candle[] | null> {
  "use cache";
  cacheLife(CANDLE_LIFE);
  const base = opsBase();
  if (!base) return null;
  const res = await fetch(`${base}/prices/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=${CANDLE_COUNT}`, { signal: AbortSignal.timeout(OPS_TIMEOUT_MS) });
  if (res.status === 429 || res.status >= 500) return fail(`candles ${res.status}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { candles?: unknown };
  return Array.isArray(body.candles) ? body.candles.filter(isCandle) : null;
}

const candles = (symbol: string, interval: MixInterval) => candlesRead(symbol, interval).catch(() => null);

async function candlesBy(symbols: readonly string[], interval: MixInterval): Promise<Record<string, Candle[] | null>> {
  return Object.fromEntries(await Promise.all(symbols.map(async (s) => [s, await candles(s, interval)] as const)));
}

/** Each card's week: the weighted line (thinned), its move, the weighted price and any stock without closes. */
export async function catalogueMixes(themes: readonly ThemeWire[], nowMs: number): Promise<Record<string, CardMix>> {
  const hourly = await candlesBy([...new Set(themes.flatMap((t) => t.spec.members.map((m) => m.symbol)))], "1h");
  return Object.fromEntries(
    themes.map((t) => {
      const line = mixSeries(membersOf(t.spec), hourly, rangeStart(nowMs, WEEK_DAYS));
      return [t.card.strategyId, { points: thinPoints(line.points, CARD_POINTS), moveBps: mixMoveBps(line.points), priceUsd: weightedPrice(membersOf(t.spec), hourly), missing: line.missing } satisfies CardMix];
    }),
  );
}

export interface ThemeMix {
  series: MixSeries;
  priceUsd: number | null;
  /** Each stock's last close (ops' display feed), null where it has none. */
  lastBy: Record<string, number | null>;
}

/** A theme's mix for every range (thinned for drawing), its weighted price and each stock's last close. */
export async function themeMix(spec: BasketSpec, nowMs: number): Promise<ThemeMix> {
  const symbols = spec.members.map((m) => m.symbol);
  const [hourly, daily] = await Promise.all([candlesBy(symbols, "1h"), candlesBy(symbols, "1d")]);
  const series = mixByRange(membersOf(spec), { "1h": hourly, "1d": daily }, nowMs);
  return {
    series: Object.fromEntries(MIX_RANGES.map((r) => [r.id, { points: thinPoints(series[r.id].points, CHART_POINTS), missing: series[r.id].missing } satisfies MixLine])) as MixSeries,
    priceUsd: weightedPrice(membersOf(spec), hourly),
    lastBy: Object.fromEntries(symbols.map((s) => [s, hourly[s]?.at(-1)?.[4] ?? null])),
  };
}

async function sessionRead(): Promise<Record<string, unknown>> {
  "use cache";
  cacheLife(CLOCK_LIFE);
  const base = opsBase();
  if (!base) return fail("no ops url");
  const res = await fetch(`${base}/session`, { signal: AbortSignal.timeout(OPS_TIMEOUT_MS) });
  return res.ok ? ((await res.json()) as Record<string, unknown>) : fail(`session ${res.status}`);
}

/** Ops' NYSE session clock; null when ops can't be read (a market-hours theme then shows no state, never a guess). */
export const marketClock = (): Promise<MarketClock | null> => sessionRead().then(clockOf, () => null);

export interface StudioStock {
  symbol: StockSymbol;
  /** Its market-hours Windows list now (no lane of it reads "paused"). */
  regular: boolean;
  /** Its 24/7 Windows list now (a RedStone `<T>---24_7` feed covers them). */
  allHours: boolean;
}

const CADENCE_MIN = [5, 15, 60];
const laneLive = (lanes: Record<string, unknown>, keys: string[]) => keys.some((k) => typeof lanes[k] === "string" && !(lanes[k] as string).startsWith("paused"));

/** The stocks a theme may hold, each with the lanes whose Windows list now (ops' roller states); null when unread. */
export async function studioStocks(): Promise<StudioStock[] | null> {
  try {
    const lanes = ((await sessionRead()).lanes ?? {}) as Record<string, unknown>;
    return basketStocks("regular").map((symbol) => ({
      symbol,
      regular: laneLive(lanes, CADENCE_MIN.map((m) => `${symbol}-${m}m`)),
      allHours: laneLive(lanes, CADENCE_MIN.map((m) => `${symbol}-24-${m}m`)),
    }));
  } catch {
    return null;
  }
}

/** The studio's preview: each stock's daily closes (a pick's three months). */
export const dailyCandles = (symbols: readonly string[]) => candlesBy(symbols, "1d");
