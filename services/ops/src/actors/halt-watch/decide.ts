// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/halt-watch/decide.ts — Pyth
// confidence, the xStocks issuer flag and Jupiter quote failures become the Tempo sources: RedStone freshness and
// signers per feed, Data Streams freshness/marketStatus (mainnet), Alpaca's tradable flag (core `laneHaltReason`).
/**
 * halt-watch's pure step: what each asset's sources say now, then the confirmed board after this observation. Session
 * assets (a stock's ticker: Regular and Gap lanes) are watched in regular hours only and clear outside them; 24/7 assets
 * (`<T>-24`, crypto) are always watched. The same step replays recorded observations (`scripts/drive/halt-replay.ts`).
 * A pass that cannot read RedStone — our own fetch is failing, or every watched RedStone feed went stale at once — is a
 * fetch failure, not a halt: its RedStone-sourced assets are observed `unread` and the board holds them (D-186).
 */
import { confirmHalt, HALT_ASSETS, laneHaltReason, redstoneHaltReason, STOCK_SYMBOLS, type HaltAsset, type HaltReason, type HaltStreak, type PrintSource, type StreamsReport } from "@cwf/core";

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
  /** When the spot feed last read RedStone (unix s; null = never). Omitted where no live read exists (unit vectors). */
  redstoneReadSec?: number | null;
}

/** Observed for an asset whose source this pass could not read: the board neither moves nor counts it. */
export const UNREAD = "unread";
export type Observation = HaltReason | typeof UNREAD | null;
export type ObservedHalts = Record<HaltAsset, Observation>;

/** The spot feed re-reads RedStone every 10 s: a view older than 3 reads can't tell a stopped feed from our failed fetch. */
export const REDSTONE_VIEW_MAX_AGE_SEC = 30;

export type RedstoneUnreadable = "fetch-failed" | "all-stale";

/** Why this pass cannot judge RedStone's freshness, or null: a stale view of ours, or every watched feed stale at once. */
export function redstoneUnreadable(o: Observations): RedstoneUnreadable | null {
  if (o.redstoneReadSec !== undefined && (o.redstoneReadSec === null || o.nowSec - o.redstoneReadSec > REDSTONE_VIEW_MAX_AGE_SEC)) return "fetch-failed";
  const watched = HALT_ASSETS.filter((a) => (o.inRegularHours || !isSessionAsset(a)) && o.primary[a] === "redstone");
  return watched.length >= 2 && watched.every((a) => redstoneHaltReason(o.redstone[a] ?? null, o.nowSec) === "redstone-stale") ? "all-stale" : null;
}

/** A stock's ticker is a session asset; `<T>-24` and crypto trade around the clock. */
export const isSessionAsset = (asset: HaltAsset): boolean => (STOCK_SYMBOLS as readonly string[]).includes(asset);

export function observeHalts(o: Observations): ObservedHalts {
  const out = Object.fromEntries(HALT_ASSETS.map((a) => [a, null])) as ObservedHalts;
  const unreadable = redstoneUnreadable(o) !== null;
  for (const asset of HALT_ASSETS) {
    if (isSessionAsset(asset) && !o.inRegularHours) continue;
    const primary = o.primary[asset] ?? null;
    if (primary === null) continue;
    const reason = laneHaltReason(primary, { redstone: o.redstone[asset] ?? null, datastreams: o.datastreams[asset] ?? null, exchangeTradable: isSessionAsset(asset) ? (o.exchange[asset] ?? null) : null }, o.nowSec);
    // The exchange's own halt is read from Alpaca, not RedStone: it still applies on a pass that can't read RedStone.
    out[asset] = unreadable && primary === "redstone" && reason !== "exchange-halt" ? UNREAD : reason;
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
    const seen = observed[asset] ?? null;
    // Unread: neither the confirmed reason nor a pending streak moves on a pass that saw nothing of the source.
    if (seen === UNREAD) continue;
    const next = confirmHalt(state.confirmed.get(asset) ?? null, state.streaks.get(asset) ?? null, seen);
    state.confirmed.set(asset, next.confirmed);
    state.streaks.set(asset, next.streak);
  }
  return state.confirmed;
}

/** Only the non-null entries: what a log row or a replay keeps. */
export const nonNull = <T>(m: Record<string, T | null> | Map<string, T | null>): Record<string, T> =>
  Object.fromEntries((m instanceof Map ? [...m.entries()] : Object.entries(m)).filter(([, v]) => v !== null)) as Record<string, T>;
