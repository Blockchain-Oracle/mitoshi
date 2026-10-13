// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/env.ts (+ crypto σ, S3).
import { TICKER_SYMBOLS, TICKERS, type TickerSymbol } from "@cwf/core";

/** Seed-maker knobs. Integers only; σ in annualized basis points. */
export interface SeedMakerEnv {
  /** `MM_SYMBOLS=TSLA,BTC`; null = every listable Series. */
  symbols: TickerSymbol[] | null;
  cadencesSec: number[];
  sigmaBps: (symbol: TickerSymbol) => number;
  halfSpreadTicks: number;
  quoteLots: bigint;
  quoteTtlSec: number;
  requoteTicks: number;
  minTick: number;
  /** Base units (6 dp): both sides' escrow on one Window. */
  maxCashPerWindow: bigint;
  gapMaxCash: bigint;
  /** 24/7 lanes (stock and crypto) cap per Window, base units. */
  allDayMaxCash: bigint;
  refreshMs: number;
  spotMaxAgeSec: number;
}

/**
 * Annualized σ defaults: 4,500 bp for a single stock (Agari); crypto from realized volatility over 2025–26 — BTC ≈ 50 %,
 * ETH ≈ 65 %, SOL ≈ 80 % — measured on calendar time (24/7), which is how the 24/7 lanes scale time (`fair.ts`).
 * `MM_SIGMA_BPS=4500` or `MM_SIGMA_BPS=TSLA:6000,BTC:4500` overrides.
 */
export const DEFAULT_SIGMA_BPS: Readonly<Record<string, number>> = { stock: 4_500, BTC: 5_000, ETH: 6_500, SOL: 8_000 };

const num = (raw: string | undefined, fallback: number, min: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? n : fallback;
};

function sigmaTable(raw: string | undefined): (symbol: TickerSymbol) => number {
  const perSymbol = new Map<string, number>();
  let all: number | null = null;
  for (const part of (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = part.split(":");
    if (b === undefined) all = num(a, 0, 1) || null;
    else perSymbol.set(a!.toUpperCase(), num(b, 0, 1));
  }
  return (symbol) => perSymbol.get(symbol) || all || DEFAULT_SIGMA_BPS[symbol] || DEFAULT_SIGMA_BPS[TICKERS[symbol].kind] || 4_500;
}

const usd = (raw: string | undefined, fallback: number) => BigInt(num(raw, fallback, 1)) * 1_000_000n;

/**
 * Depth (D-230): each side quotes `MM_QUOTE_LOTS` lots — a lot pays $0.001, so 25,000 lots pay $25 and cost $5–20 —
 * enough for the terminal's default stake (5 % of what you can spend, at most $10) to fill at any price from 40¢. It
 * was 5,000 lots ($2–4 a side): a default stake met "no liquidity at this size" or a $3 cap. Both sides together escrow
 * ≈ 940 × lots base units, $23.50, inside every lane's cap; the house holds $700k of test dollars for ~60 books.
 */
export const DEFAULT_QUOTE_LOTS = 25_000;

export function readSeedMakerEnv(env: NodeJS.ProcessEnv = process.env): SeedMakerEnv {
  const symbols = (env.MM_SYMBOLS ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s): s is TickerSymbol => (TICKER_SYMBOLS as readonly string[]).includes(s));
  const cadences = (env.MM_CADENCES ?? "").split(",").map(Number).filter((n) => [300, 900, 3_600, 604_800].includes(n));
  return {
    symbols: symbols.length ? symbols : null,
    cadencesSec: cadences.length ? cadences : [300, 900, 3_600, 604_800],
    sigmaBps: sigmaTable(env.MM_SIGMA_BPS),
    halfSpreadTicks: num(env.MM_HALF_SPREAD_TICKS, 30, 1),
    quoteLots: BigInt(num(env.MM_QUOTE_LOTS, DEFAULT_QUOTE_LOTS, 1)),
    quoteTtlSec: num(env.MM_QUOTE_TTL_SEC, 120, 30),
    requoteTicks: num(env.MM_REQUOTE_TICKS, 10, 1),
    minTick: num(env.MM_MIN_TICK, 20, 1),
    maxCashPerWindow: usd(env.MM_MAX_CASH_PER_WINDOW, 50),
    gapMaxCash: usd(env.MM_GAP_MAX_CASH, 25),
    allDayMaxCash: usd(env.MM_ALLDAY_MAX_CASH_PER_WINDOW, 50),
    refreshMs: num(env.MM_REFRESH_MS, 10_000, 2_000),
    spotMaxAgeSec: num(env.MM_SPOT_MAX_AGE_SEC, 30, 5),
  };
}
