// Ported from Owarine ecb7565b:services/ops/src/prices/alpaca-bars.ts — Mitoshi's ticker registry, the display
// `displayE8` for Alpaca's JSON numbers, and the keys/host shared with `alpaca-trades.ts`.
/**
 * Alpaca market data for the stocks on the terminal (S23a): chart candles from `/v2/stocks/<S>/bars` and the picker's
 * day figures from `/v2/stocks/snapshots`, on the IEX feed the display line reads (`alpaca-trades.ts`). Every chart
 * interval is an Alpaca timeframe, so nothing is aggregated; bars come newest first (`sort=desc`) and are returned
 * oldest first. Display only.
 */
import { TICKERS, type TickerSymbol } from "@cwf/core";
import { alpacaBase, alpacaHeaders, type AlpacaKeys } from "./alpaca-trades";
import { displayE8, type Fetch } from "./types";

const TIMEFRAME: Record<string, string> = { "1m": "1Min", "3m": "3Min", "5m": "5Min", "15m": "15Min", "30m": "30Min", "1h": "1Hour", "2h": "2Hour", "4h": "4Hour", "12h": "12Hour", "1d": "1Day" };
/** A trading day is 6.5 of 24 hours and a week 5 of 7 days: reach this many intervals back per bar wanted, plus a long weekend. */
const REACH = 7;
const WEEKEND_SEC = 4 * 86_400;

export type Candle = [number, number, number, number, number];

/** The Alpaca symbol behind a ticker; null for anything Alpaca doesn't price (crypto). */
export function alpacaSymbolOf(symbol: string): string | null {
  return (TICKERS as Record<string, { alpacaSymbol: string | null } | undefined>)[symbol]?.alpacaSymbol ?? null;
}

/** `{ bars: [{ t, o, h, l, c }] }` in any order → ascending `[tMs, o, h, l, c]`. */
export function parseAlpacaBars(text: string): Candle[] {
  const body = JSON.parse(text) as { bars?: Array<{ t?: string; o?: number; h?: number; l?: number; c?: number }> | null; message?: string };
  if (body.bars === undefined) throw new Error(`alpaca bars: ${body.message ?? text.slice(0, 120)}`);
  return (body.bars ?? [])
    .filter((b) => typeof b.t === "string" && [b.o, b.h, b.l, b.c].every((v) => typeof v === "number"))
    .map((b) => [Date.parse(b.t!), b.o!, b.h!, b.l!, b.c!] as Candle)
    .sort((a, b) => a[0] - b[0]);
}

export async function alpacaCandles(fetchImpl: Fetch, keys: AlpacaKeys, symbol: string, interval: string, intervalSec: number, count: number, endMs: number): Promise<Candle[]> {
  const sym = alpacaSymbolOf(symbol);
  const timeframe = TIMEFRAME[interval];
  if (!sym || !timeframe) return [];
  const endSec = Math.floor(endMs / 1000);
  const startSec = endSec - count * intervalSec * REACH - WEEKEND_SEC;
  const iso = (sec: number) => new Date(sec * 1000).toISOString();
  const url = `${alpacaBase(keys)}/stocks/${sym}/bars?timeframe=${timeframe}&start=${iso(startSec)}&end=${iso(endSec)}&limit=${count}&sort=desc&feed=iex&adjustment=raw`;
  const r = await fetchImpl(url, { headers: alpacaHeaders(keys), signal: AbortSignal.timeout(6_000) });
  if (!r.ok) throw new Error(`alpaca bars HTTP ${r.status}`);
  return parseAlpacaBars(await r.text());
}

export interface DayStats {
  /** The change's reference, × 10⁸: a stock's previous close, a crypto's price 24 h ago. */
  openE8: string;
  highE8: string;
  lowE8: string;
  /** Null where the source has no volume (the RedStone fallback). */
  volume: string | null;
  /** What `openE8` is: the previous regular close (Alpaca) or the price 24 h ago (Coinbase, Bitstamp, RedStone). */
  basis: "prev-close" | "24h";
  source: "coinbase" | "bitstamp" | "alpaca" | "redstone";
}

/**
 * Today's bar per symbol. A stock's change is quoted against the previous close, so `openE8` carries that close
 * (the picker's change is `last / open − 1`); before today's first trade it is yesterday's bar against the day before.
 */
export function parseAlpacaSnapshots(text: string, symbols: readonly TickerSymbol[]): Record<string, DayStats> {
  type Bar = { o?: number; h?: number; l?: number; c?: number; v?: number };
  const body = JSON.parse(text) as Record<string, { dailyBar?: Bar | null; prevDailyBar?: Bar | null } | null>;
  const out: Record<string, DayStats> = {};
  for (const symbol of symbols) {
    const snap = body[alpacaSymbolOf(symbol) ?? ""];
    const day = snap?.dailyBar;
    const prev = snap?.prevDailyBar;
    const ref = displayE8(typeof prev?.c === "number" ? prev.c : day?.o);
    const high = displayE8(day?.h);
    const low = displayE8(day?.l);
    if (!ref || !high || !low) continue;
    out[symbol] = { openE8: ref.toString(), highE8: high.toString(), lowE8: low.toString(), volume: String(day?.v ?? 0), basis: "prev-close", source: "alpaca" };
  }
  return out;
}

export async function alpacaDay(fetchImpl: Fetch, keys: AlpacaKeys, symbols: readonly TickerSymbol[]): Promise<Record<string, DayStats>> {
  const syms = symbols.map(alpacaSymbolOf).filter((s): s is string => s !== null);
  if (syms.length === 0) return {};
  const r = await fetchImpl(`${alpacaBase(keys)}/stocks/snapshots?symbols=${syms.join(",")}&feed=iex`, { headers: alpacaHeaders(keys), signal: AbortSignal.timeout(6_000) });
  if (!r.ok) throw new Error(`alpaca snapshots HTTP ${r.status}`);
  return parseAlpacaSnapshots(await r.text(), symbols);
}
