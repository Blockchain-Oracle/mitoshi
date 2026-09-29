// Ported from Agari 03b30ab:packages/core/src/types/session-lanes.ts
import type { StockSymbol, TickerSymbol } from "../market/tickers";
import type { LaneBasis, PrintSource, VoidReason } from "./market";

/**
 * The S6 session-lane inputs every consumer shares (`docs/plan/specs/session-lanes.md` §3, D-051). Frozen at the S6
 * foundation: ops `halt-watch` and the earnings/corporate readers produce them, `/session` serves them, the roller,
 * the maker and the web states read them.
 */

/**
 * Why a lane is halted off-chain (§3.1; plan C.5.2 halt-watch). These are signed-source health signals (RedStone
 * staleness and signer count, Data Streams freshness and `marketStatus`) plus the exchange's own tradable flag
 * (Alpaca asset status). A halt never changes the chain: an open Window voids by itself when its print can't be
 * recorded.
 */
export const HALT_REASONS = ["redstone-stale", "redstone-signers", "datastreams-stale", "datastreams-closed", "exchange-halt"] as const;
export type HaltReason = (typeof HALT_REASONS)[number];

/** Only these say "Trading halted"; the stale and signer reasons say "Signed price stale" (Q-S6-9). */
export const TRADING_HALT_REASONS: readonly HaltReason[] = ["exchange-halt", "datastreams-closed"];

export interface HaltEntry {
  reason: HaltReason;
  /** When this reason was first seen (the entry keeps it while the reason holds). */
  sinceSec: number;
}

/** A halt key: the ticker for Regular, Gap and crypto Windows; `<T>-24` for a stock's 24/7 lane (its own feed). */
export type HaltAsset = TickerSymbol | `${StockSymbol}-24`;

export type HaltBoard = Partial<Record<HaltAsset, HaltEntry>>;

/** Finnhub's report timing: before the open, after the close, during market hours. */
export type EarningsHour = "bmo" | "amc" | "dmh";

/** One Finnhub `/calendar/earnings` row (§3.3); the same shape as S13's `finnhub.server.ts` (Q-S13-9). */
export interface EarningsEvent {
  symbol: TickerSymbol;
  /** ET date, `YYYY-MM-DD`. */
  dateEt: string;
  hour: EarningsHour | null;
}

/** `earnings-session`: a Regular Window on a report date. `earnings-gap`: a Gap over an `amc` Friday or a `bmo` Monday. */
export type EarningsFlag = "earnings-session" | "earnings-gap";

/** `services/ops/config/corporate-actions.json` `skips[]` (§3.4). No `lanes` = every lane of that ticker. */
export interface CorporateSkip {
  symbol: TickerSymbol;
  /** ET date, `YYYY-MM-DD`. A Gap matches its Friday or its Monday. */
  date: string;
  why: string;
  lanes?: readonly LaneBasis[];
}

/**
 * `multipliers[]`: a stock-token multiplier change (the mirror's `ScaledUIView`, S14). The 24/7 lane skips a Window whose
 * span contains `effectiveSec`, since the reference price jumps mid-Window.
 */
export interface MultiplierChange {
  symbol: StockSymbol;
  effectiveSec: number;
  /** Decimal strings, exactly as the issuer publishes them (never parsed to floats). */
  from: string;
  to: string;
  why: string;
}

export type VoidSlot = "open" | "close";

/** What a void verdict names (§3.2): the on-chain reason plus the empty slot, when the result shows one. */
export interface VoidDetail {
  reason: VoidReason;
  slot: VoidSlot | null;
  source: PrintSource | null;
  /** The boundary T of the missing or diverging print. */
  boundarySec: number | null;
  /** The last admissible second for that print. */
  deadlineSec: number | null;
}
