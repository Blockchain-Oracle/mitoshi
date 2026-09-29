// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/halt-watch/decide.ts — Pyth
// confidence, the xStocks issuer flag and Jupiter quote failures become the Tempo sources: RedStone freshness and
// signers per feed, Data Streams freshness/marketStatus (mainnet), Alpaca's tradable flag (core `laneHaltReason`).
/**
 * halt-watch's pure step: what each asset's sources say now, then the confirmed board after this observation. Session
 * assets (a stock's ticker: Regular and Gap lanes) are watched in regular hours only and clear outside them; 24/7 assets
 * (`<T>-24`, crypto) are always watched. The same step replays recorded observations (`scripts/drive/halt-replay.ts`).
 */
import { confirmHalt, HALT_ASSETS, laneHaltReason, STOCK_SYMBOLS, type HaltAsset, type HaltReason, type HaltStreak, type PrintSource, type StreamsReport } from "@cwf/core";

export interface Observations {
  nowSec: number;
  inRegularHours: boolean;
  /** Each asset's primary source now; absent/null = no signed source (the lane is paused, not halted). */
  primary: Partial<Record<HaltAsset, PrintSource | null>>;
  /** The newest RedStone package per asset: its time and distinct configured signers. */
  redstone: Partial<Record<HaltAsset, { packageSec: number; signers: number }>>;
  datastreams: Partial<Record<HaltAsset, StreamsReport>>;
  /** Alpaca `tradable` per stock ticker; absent = not read yet. */
  exchange: Partial<Record<HaltAsset, boolean>>;
}

export type ObservedHalts = Record<HaltAsset, HaltReason | null>;

/** A stock's ticker is a session asset; `<T>-24` and crypto trade around the clock. */
export const isSessionAsset = (asset: HaltAsset): boolean => (STOCK_SYMBOLS as readonly string[]).includes(asset);

export function observeHalts(o: Observations): ObservedHalts {
  const out = Object.fromEntries(HALT_ASSETS.map((a) => [a, null])) as ObservedHalts;
  for (const asset of HALT_ASSETS) {
    if (isSessionAsset(asset) && !o.inRegularHours) continue;
    const primary = o.primary[asset] ?? null;
    if (primary === null) continue;
    out[asset] = laneHaltReason(primary, { redstone: o.redstone[asset] ?? null, datastreams: o.datastreams[asset] ?? null, exchangeTradable: isSessionAsset(asset) ? (o.exchange[asset] ?? null) : null }, o.nowSec);
  }
  return out;
}

export interface HaltState {
  confirmed: Map<HaltAsset, HaltReason | null>;
  streaks: Map<HaltAsset, HaltStreak | null>;
}

export const emptyHaltState = (): HaltState => ({ confirmed: new Map(), streaks: new Map() });

/** Folds one observation into the state (mutated) and returns the confirmed reasons. */
export function stepHalts(state: HaltState, observed: ObservedHalts, inRegularHours: boolean): Map<HaltAsset, HaltReason | null> {
  for (const asset of HALT_ASSETS) {
    if (!inRegularHours && isSessionAsset(asset)) {
      state.confirmed.set(asset, null);
      state.streaks.set(asset, null);
      continue;
    }
    const next = confirmHalt(state.confirmed.get(asset) ?? null, state.streaks.get(asset) ?? null, observed[asset]);
    state.confirmed.set(asset, next.confirmed);
    state.streaks.set(asset, next.streak);
  }
  return state.confirmed;
}

/** Only the non-null entries: what a log row or a replay keeps. */
export const nonNull = <T>(m: Record<string, T | null> | Map<string, T | null>): Record<string, T> =>
  Object.fromEntries((m instanceof Map ? [...m.entries()] : Object.entries(m)).filter(([, v]) => v !== null)) as Record<string, T>;
