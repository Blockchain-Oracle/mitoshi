/**
 * The launchpads as the index serves them (R6 money, S02 + S08; D-230): one launch's facts, its trades and its holders
 * (`/api/launch?token=`), and the board (`/api/launch`). Wire shapes — every amount a base-unit decimal string, prices
 * pathUSD per coin at 1e18 — shared by the reader (`@cwf/db/idx`), the route and the hooks, plus the pure candles a
 * token's chart draws from its trades.
 */

export type LaunchStage = "trading" | "complete" | "graduated";

export interface LaunchFactsWire {
  token: string;
  kind: "memecoin" | "stablecoin";
  creator: string;
  name: string | null;
  symbol: string | null;
  logoURI: string | null;
  decimals: number | null;
  totalSupply: string | null;
  thresholdQuote: string | null;
  createdBlock: number;
  createdSec: number;
  stage: LaunchStage;
  priceE18: string | null;
  quoteReserve: string;
  coinSold: string;
  graduatedSec: number | null;
  poolId: string | null;
}

export interface LaunchTradeWire {
  txHash: string;
  logIndex: number;
  trader: string;
  isBuy: boolean;
  quoteBase: string;
  coinRaw: string;
  priceE18: string;
  venue: "curve" | "pool";
  blockNumber: number;
  atSec: number;
}

export type HolderLabel = "curve" | "pool" | "creator";

export interface LaunchHolderWire {
  holder: string;
  balanceRaw: string;
  label: HolderLabel | null;
}

/** How far the index has read (the lowest of the launch followers' cursors). */
export interface IndexedTo {
  block: number;
  atSec: number;
}

export interface LaunchFeedWire {
  launch: LaunchFactsWire | null;
  /** The last 500 trades, oldest first. */
  trades: LaunchTradeWire[];
  /** `count` leaves out the curve, the pool, the locker and the zero address; `top` is the 20 largest (labelled). */
  holders: { count: number; top: LaunchHolderWire[] };
  indexedTo: IndexedTo | null;
}

export interface LaunchBoardRowWire {
  token: string;
  kind: "memecoin" | "stablecoin";
  name: string | null;
  symbol: string | null;
  logoURI: string | null;
  creator: string;
  /** Launched by the team's own keys (QA, drives): hidden unless asked for, tagged when shown. */
  team: boolean;
  createdSec: number;
  stage: LaunchStage;
  progressBps: number;
  priceE18: string | null;
  /** Price × `totalSupply`: a memecoin's whole supply at the last price, as the token page and pump.fun count it. */
  mcapBase: string | null;
  /** A memecoin's full supply (its template's, not what the curve has minted so far); a stablecoin's at launch. */
  totalSupply: string | null;
  vol24hBase: string;
  trades24h: number;
  holders: number;
  /** The last 48 indexed prices, oldest first. */
  spark: string[];
  raisedBase: string;
  graduatedSec: number | null;
}

export interface LaunchBoardWire {
  rows: LaunchBoardRowWire[];
  head: { count: number; raisedBase: string; top: { token: string; symbol: string | null; progressBps: number } | null };
  /** Team launches on chain (shown or not). */
  teamCount: number;
  indexedTo: IndexedTo | null;
}

export interface LaunchCandle {
  /** Bucket start, epoch ms. */
  t: number;
  o: bigint;
  h: bigint;
  l: bigint;
  c: bigint;
  /** Σ quote traded in the bucket, base units. */
  v: bigint;
}

/**
 * OHLC per `intervalMs` bucket from trades (oldest first, prices at 1e18): open the bucket's first trade, close its
 * last, high and low its extremes, volume the quote it traded. A bucket with no trade is not invented. Pure.
 */
export function candlesFromTrades(trades: readonly { atSec: number; priceE18: bigint; quoteBase: bigint }[], intervalMs: number): LaunchCandle[] {
  const out: LaunchCandle[] = [];
  for (const tr of [...trades].sort((a, b) => a.atSec - b.atSec)) {
    const t = Math.floor((tr.atSec * 1000) / intervalMs) * intervalMs;
    const last = out.at(-1);
    if (last && last.t === t) {
      if (tr.priceE18 > last.h) last.h = tr.priceE18;
      if (tr.priceE18 < last.l) last.l = tr.priceE18;
      last.c = tr.priceE18;
      last.v += tr.quoteBase;
    } else {
      out.push({ t, o: tr.priceE18, h: tr.priceE18, l: tr.priceE18, c: tr.priceE18, v: tr.quoteBase });
    }
  }
  return out;
}

/** The move over 24 h: the price now against the last trade at or before now − 24 h, else since the first trade. */
export function dayChangeBps(nowPriceE18: bigint, trades: readonly { atSec: number; priceE18: bigint }[], nowSec: number): { bps: number; since: "24h" | "launch" } | null {
  if (trades.length === 0) return null;
  const sorted = [...trades].sort((a, b) => a.atSec - b.atSec);
  const before = sorted.filter((t) => t.atSec <= nowSec - 86_400).at(-1);
  const ref = before ?? sorted[0]!;
  if (ref.priceE18 <= 0n) return null;
  return { bps: Number(((nowPriceE18 - ref.priceE18) * 10_000n) / ref.priceE18), since: before ? "24h" : "launch" };
}
