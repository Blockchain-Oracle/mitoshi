"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/settings.ts — the stake in integer base units (pathUSD, 6 dp)
// instead of float credits; "Close tolerance" (D-197) in place of the slippage row; sound, haptics, reactions and
// music live in the app-wide Sound & Vibration store (`lib/feedback.ts`), so they are not repeated here.
import { useSyncExternalStore } from "react";
import { CANDLE_INTERVALS, type CandleInterval } from "./chart/candles";

/**
 * The terminal's settings, to Tradash's (`settings` slice): one object, persisted per browser behind try/catch (a
 * private window simply uses the defaults). The stake, while untouched, follows 5 % of what is spendable, as the
 * reference re-derives it on every balance change.
 */
export interface TradeSettings {
  /** The stake once the user set one, base units as a decimal string; null while it follows 5 % of spendable. */
  sizeBase: string | null;
  /** Trail distance as a fraction (0.001 = 0.10 %). */
  trailPct: number;
  /** How far under the shown Close value a one-tap Close may land without asking (D-197), bps. */
  closeToleranceBps: number;
  musicTrack: MusicTrack;
  tutorialSeen: boolean;
  favourites: string[];
  /** Tradash's chart view and candle interval (picking an interval switches to candles). */
  chartView: "line" | "candles";
  chartInterval: CandleInterval;
  /** Tradash's leverage as Mitoshi's Boost (RV-41): the multiple UP/DOWN open at; 1 is a plain call. */
  boostX: number;
}

export type MusicTrack = "arcade" | "rush" | "night";
export const MUSIC_TRACKS: readonly MusicTrack[] = ["arcade", "rush", "night"];
export const TRAIL_CHOICES = [0.001, 0.005, 0.01, 0.02] as const;
export const TRAIL_MIN = 0.001;
export const TRAIL_MAX = 0.1;
export const CLOSE_TOLERANCE_CHOICES_BPS = [50, 100, 200, 500] as const;
/** Default stake: this share of spendable (Tradash's 5 %), in basis points, never under the minimum. */
export const DEFAULT_SIZE_SHARE_BPS = 500n;

const KEY = "cwf.trade.settings.v1";
const DEFAULTS: TradeSettings = { sizeBase: null, trailPct: 0.001, closeToleranceBps: 100, musicTrack: "arcade", tutorialSeen: false, favourites: [], chartView: "line", chartInterval: "1m", boostX: 1 };

const listeners = new Set<() => void>();
let current: TradeSettings = DEFAULTS;
let hydrated = false;

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

function read(): TradeSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<TradeSettings>;
    return {
      sizeBase: typeof p.sizeBase === "string" && /^\d{1,18}$/.test(p.sizeBase) && BigInt(p.sizeBase) > 0n ? p.sizeBase : null,
      trailPct: num(p.trailPct, TRAIL_MIN, TRAIL_MAX) ? p.trailPct : DEFAULTS.trailPct,
      closeToleranceBps: num(p.closeToleranceBps, 0, 2_000) ? Math.round(p.closeToleranceBps) : DEFAULTS.closeToleranceBps,
      musicTrack: MUSIC_TRACKS.includes(p.musicTrack as MusicTrack) ? (p.musicTrack as MusicTrack) : "arcade",
      tutorialSeen: p.tutorialSeen === true,
      favourites: Array.isArray(p.favourites) ? p.favourites.filter((s): s is string => typeof s === "string").slice(0, 100) : [],
      chartView: p.chartView === "candles" ? "candles" : "line",
      chartInterval: CANDLE_INTERVALS.includes(p.chartInterval as CandleInterval) ? (p.chartInterval as CandleInterval) : "1m",
      boostX: num(p.boostX, 1, 10) && Number.isInteger(p.boostX) ? p.boostX : 1,
    };
  } catch {
    return DEFAULTS;
  }
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  current = read();
}

export function setTradeSettings(next: Partial<TradeSettings>): void {
  hydrate();
  current = { ...current, ...next };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the setting lasts for this tab.
  }
  listeners.forEach((l) => l());
}

export function tradeSettings(): TradeSettings {
  hydrate();
  return current;
}

/** Null before the browser's settings are read (server render and the first client pass), then the settings. */
export function useTradeSettingsState(): TradeSettings | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (hydrated ? current : (hydrate(), current)),
    () => null,
  );
}

export function useTradeSettings(): TradeSettings {
  return useTradeSettingsState() ?? DEFAULTS;
}

/** The stake a tap wants before caps: the set size, or 5 % of spendable, never under `minBase`. */
export function wantedStakeBase(settings: Pick<TradeSettings, "sizeBase">, spendableBase: bigint | null, minBase: bigint): bigint {
  if (settings.sizeBase !== null) return BigInt(settings.sizeBase);
  const auto = ((spendableBase ?? 0n) * DEFAULT_SIZE_SHARE_BPS) / 10_000n;
  return auto > minBase ? auto : minBase;
}
