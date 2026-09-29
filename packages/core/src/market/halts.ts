// Ported from Agari 03b30ab:packages/core/src/market/halts.ts — Pyth/Switchboard/xStock signals replaced by the Tempo
// sources: RedStone freshness + signers, Data Streams freshness + marketStatus, the exchange's tradable flag
// (plan C.5.2 halt-watch). The confirmation streak and labels are kept.
import { STOCK_SYMBOLS, TICKER_SYMBOLS } from "./tickers";
import { TRADING_HALT_REASONS, type HaltAsset, type HaltBoard, type HaltEntry, type HaltReason } from "../types/session-lanes";
import type { LaneBasis, PrintSource } from "../types/market";
import type { TickerSymbol } from "./tickers";

/**
 * Halt rules. No licensed halt feed exists, so a lane is halted when the signed source it settles on stops being
 * printable, or when the exchange itself marks the name untradable. Pure: `halt-watch` reads the sources, this decides.
 *
 * A halt never touches the chain. It stops the roller listing and the maker quoting; a Window already open voids by
 * itself when its print can't be recorded, and its verdict names the missing print, never the halt.
 */

export const HALT_ASSETS: readonly HaltAsset[] = [...TICKER_SYMBOLS, ...STOCK_SYMBOLS.map((s) => `${s}-24` as const)];

/** The halt key of a lane: the 24/7 stock lane has its own feed, so its own key. */
export function haltAssetOf(symbol: TickerSymbol, lane: LaneBasis): HaltAsset {
  return lane === "stock24" ? (`${symbol}-24` as HaltAsset) : symbol;
}

/** RedStone packages land every ≈ 10 s; the newest older than 60 s is a stopped feed. */
export const REDSTONE_STALE_SEC = 60;
/** The verifier's signer threshold (engine RedStone verifier): fewer unique signers can't print. */
export const REDSTONE_MIN_SIGNERS = 3;
/** Data Streams reports are pulled on demand; one older than 60 s is a stopped stream. */
export const DATASTREAMS_STALE_SEC = 60;

/** `redstone-stale` when the newest package is older than 60 s (or none), else `redstone-signers` below the threshold. */
export function redstoneHaltReason(newest: { packageSec: number; signers: number } | null, nowSec: number, minSigners = REDSTONE_MIN_SIGNERS): HaltReason | null {
  if (!newest || nowSec - newest.packageSec > REDSTONE_STALE_SEC) return "redstone-stale";
  return newest.signers < minSigners ? "redstone-signers" : null;
}

/**
 * A Data Streams report as halt-watch reads it. `marketOpen` is the caller's reading of the report's `marketStatus`
 * (null when the schema carries none, e.g. crypto).
 */
export interface StreamsReport {
  observationsSec: number;
  marketOpen: boolean | null;
}

export function dataStreamsHaltReason(report: StreamsReport | null, nowSec: number): HaltReason | null {
  if (!report || nowSec - report.observationsSec > DATASTREAMS_STALE_SEC) return "datastreams-stale";
  return report.marketOpen === false ? "datastreams-closed" : null;
}

/** The exchange's own flag (Alpaca `tradable`/`status`), authoritative when read; null = not read yet. */
export function exchangeHaltReason(tradable: boolean | null): HaltReason | null {
  return tradable === false ? "exchange-halt" : null;
}

/** A ticker's policy versions reduced to what halts need (`tickers.<SYM>.versions`). */
export interface SourceVersion {
  validFromSec: number;
  /** Null = open-ended. Inclusive, like the roller's coverage rule. */
  validUntilSec: number | null;
  primary: PrintSource;
}

/** The primary source of the newest version valid at `nowSec`; null when no version is (the lane is paused, not halted). */
export function primarySourceAt(versions: readonly SourceVersion[], nowSec: number): PrintSource | null {
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i]!;
    if (v.validFromSec <= nowSec && (v.validUntilSec === null || nowSec <= v.validUntilSec)) return v.primary;
  }
  return null;
}

export interface SourceHealth {
  redstone: { packageSec: number; signers: number } | null;
  datastreams: StreamsReport | null;
  exchangeTradable: boolean | null;
}

/**
 * A lane's halt from its primary source; the exchange flag wins first for stocks. A check source never halts: a
 * missing check only flags `singleSource`.
 */
export function laneHaltReason(primary: PrintSource | null, health: SourceHealth, nowSec: number): HaltReason | null {
  const exchange = exchangeHaltReason(health.exchangeTradable);
  if (exchange) return exchange;
  if (primary === "redstone") return redstoneHaltReason(health.redstone, nowSec);
  if (primary === "datastreams") return dataStreamsHaltReason(health.datastreams, nowSec);
  return null;
}

/** Observations in a row before a lane's halt state changes. The exchange flag is authoritative and applies at once. */
export function confirmPasses(observed: HaltReason | null): number {
  return observed === "exchange-halt" ? 1 : 2;
}

export interface HaltStreak {
  /** The observed state that differs from the confirmed one. */
  pending: HaltReason | null;
  seen: number;
}

/**
 * One observation against the confirmed state: a different reason (or a clear) takes effect only after
 * `confirmPasses` observations in a row, so one late tick or one failed read never flips a lane.
 */
export function confirmHalt(confirmed: HaltReason | null, streak: HaltStreak | null, observed: HaltReason | null): { confirmed: HaltReason | null; streak: HaltStreak | null } {
  if (observed === confirmed) return { confirmed, streak: null };
  const seen = streak && streak.pending === observed ? streak.seen + 1 : 1;
  return seen >= confirmPasses(observed) ? { confirmed: observed, streak: null } : { confirmed, streak: { pending: observed, seen } };
}

/** Q-S6-9: only the exchange's halt or a closed-market report says "Trading halted"; a stale source says why. */
export function haltLabel(reason: HaltReason): "Trading halted" | "Signed price stale" {
  return TRADING_HALT_REASONS.includes(reason) ? "Trading halted" : "Signed price stale";
}

/** The roller's lane state for a halted asset. */
export function haltPausedState(entry: HaltEntry): string {
  return `paused: halted (${entry.reason})`;
}

export function haltOf(board: HaltBoard, asset: HaltAsset): HaltEntry | null {
  return board[asset] ?? null;
}
