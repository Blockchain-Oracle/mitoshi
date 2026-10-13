// Adapted from Owarine 90a91d71:packages/core/src/x/share-link.ts (C13a's signed Window share link) — S11 (D-227,
// A-3e): Solana Blinks have no Tempo analogue, so a share is a share-to-sign link. It opens the terminal on that ticker,
// Window and side with the stake set; nothing is placed until the person opening it signs with their own passkey, so
// the link needs no signature of its own (Owarine signed it because a Canton seat traded on the link's word).
import { isTickerSymbol, type TickerSymbol } from "../market/tickers";
import type { LaneBasis, Side } from "../types/market";
import { X_CADENCES, parseStakeBase, type XCadence } from "./parse";
import { xLanesOf } from "./window";

export const GO_SIDE_PARAM = "side";
export const GO_STAKE_PARAM = "stake";
/** A share link never prefills more than this (base units, $1,000): a bigger stake is typed by the person, not a link. */
export const GO_MAX_STAKE_BASE = 1_000_000_000n;

export interface GoTarget {
  side: Side | null;
  /** The stake to prefill, base units; null leaves the terminal's own. */
  stakeBase: bigint | null;
}

export interface GoTrade extends GoTarget {
  symbol: TickerSymbol;
  cadence: XCadence;
  /** The lane the link opens: the first lane that prices the name (`xLanesOf`). */
  lane: LaneBasis;
}

const sideOf = (raw: string | null | undefined): Side | null => (raw === "up" || raw === "down" ? raw : null);

function stakeOf(raw: string | null | undefined, decimals: number): bigint | null {
  const base = parseStakeBase(raw, decimals);
  return base !== null && base <= GO_MAX_STAKE_BASE ? base : null;
}

/** `/go/t/<symbol>/<cadence>?side=&stake=`: null for a symbol or cadence Mitoshi doesn't list (the page says so). */
export function readGoTrade(symbol: string, cadence: string, get: (name: string) => string | null | undefined, decimals: number): GoTrade | null {
  const upper = symbol.toUpperCase();
  if (!isTickerSymbol(upper) || !Object.hasOwn(X_CADENCES, cadence)) return null;
  return { symbol: upper, cadence: cadence as XCadence, lane: xLanesOf(upper)[0]!, side: sideOf(get(GO_SIDE_PARAM)), stakeBase: stakeOf(get(GO_STAKE_PARAM), decimals) };
}

/** `/go/w/<marketId>?side=&stake=`: the side and stake; the Window id is checked by the page. */
export function readGoTarget(get: (name: string) => string | null | undefined, decimals: number): GoTarget {
  return { side: sideOf(get(GO_SIDE_PARAM)), stakeBase: stakeOf(get(GO_STAKE_PARAM), decimals) };
}

/** The terminal address a share link lands on: the lane (`basis:seconds`) or the Window, and the side picked. */
export function goTerminalHref(symbol: TickerSymbol, at: { lane: LaneBasis; cadenceSec: number } | { marketId: string }, side: Side | null): string {
  const q = new URLSearchParams("lane" in at ? { lane: `${at.lane}:${at.cadenceSec}` } : { w: at.marketId });
  if (side) q.set("pick", side);
  return `/trade/${symbol}?${q.toString()}`;
}

/** The share link for a call: `<origin>/go/t/BTC/5m?side=up&stake=5`. */
export function goTradeUrl(origin: string, symbol: TickerSymbol, cadence: XCadence, side?: Side | null, stake?: string | null): string {
  const q = new URLSearchParams();
  if (side) q.set(GO_SIDE_PARAM, side);
  if (stake) q.set(GO_STAKE_PARAM, stake);
  const tail = q.toString();
  return `${origin.replace(/\/+$/, "")}/go/t/${symbol}/${cadence}${tail ? `?${tail}` : ""}`;
}

/** The share link for one Window: `<origin>/go/w/<marketId>?side=down&stake=10`. */
export function goWindowUrl(origin: string, marketId: string, side?: Side | null, stake?: string | null): string {
  const q = new URLSearchParams();
  if (side) q.set(GO_SIDE_PARAM, side);
  if (stake) q.set(GO_STAKE_PARAM, stake);
  const tail = q.toString();
  return `${origin.replace(/\/+$/, "")}/go/w/${marketId.toLowerCase()}${tail ? `?${tail}` : ""}`;
}
