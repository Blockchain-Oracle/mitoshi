/**
 * The display feed's basis to the signed feed (D-206). Every time a signed value (RedStone, 10 s) is new, it is compared
 * with the display price at the same second — `ln(signed / display)` in bps — and the samples are kept per signed feed.
 * Measured on Moderato 2026-10-08 (26 min, ~130 prints a feed): BTC 0.68 ± 1.85 bps, ETH 0.40 ± 1.90, SOL 0.64 ± 2.81,
 * TSLA 0.30 ± 0.72, NVDA 0.33 ± 0.87 — a small, steady offset, against 2–5 bps of the signed value's own 10 s staleness
 * (BTC p50 / p90 2.1 / 5.3 bps). So display × e^basis is a better estimate of what the signed feed reads now than the
 * signed value itself, and the maker centres there (`guard.ts`). Pure apart from the feed it listens to.
 */
import type { DisplayFeed, DisplayQuote } from "../../display/types";

/** Display seconds kept per symbol, a little over the signed value's worst age. */
export const BASIS_WINDOW_SEC = 120;
/** Samples kept per signed feed (~20 min of 10 s prints), and the fewest that count as an estimate (2 min). */
export const BASIS_SAMPLES = 120;
export const BASIS_MIN_SAMPLES = 12;

export interface BasisEstimate {
  /** Mean of `ln(signed / display)`, bps. */
  meanBps: number;
  /** Its standard error, bps. */
  seBps: number;
  samples: number;
}

export interface BasisTracker {
  /** Records a signed value (once per publish time) and returns the feed's estimate, or null with too few samples. */
  observe(feedKey: string, displaySymbol: string, signedE8: bigint, signedAtSec: number): BasisEstimate | null;
  stop(): void;
}

/** The estimate from samples, or null under `BASIS_MIN_SAMPLES`. */
export function basisOf(samples: readonly number[]): BasisEstimate | null {
  if (samples.length < BASIS_MIN_SAMPLES) return null;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
  return { meanBps: mean, seBps: Math.sqrt(variance / samples.length), samples: samples.length };
}

export function createBasisTracker(feed: DisplayFeed): BasisTracker {
  const seconds = new Map<string, Map<number, bigint>>();
  const samples = new Map<string, { lastAtSec: number; bps: number[] }>();
  const off = feed.subscribe((q: DisplayQuote) => {
    // RedStone's own value as display (the feed's fallback) is no independent reading.
    if (q.source === "redstone") return;
    let ring = seconds.get(q.symbol);
    if (!ring) seconds.set(q.symbol, (ring = new Map()));
    const sec = Math.floor(q.atMs / 1000);
    ring.set(sec, q.priceE8);
    for (const k of ring.keys()) if (k < sec - BASIS_WINDOW_SEC) ring.delete(k);
  });
  return {
    observe(feedKey, displaySymbol, signedE8, signedAtSec) {
      const s = samples.get(feedKey) ?? { lastAtSec: 0, bps: [] };
      if (signedAtSec > s.lastAtSec) {
        const ring = seconds.get(displaySymbol);
        const display = ring?.get(signedAtSec) ?? ring?.get(signedAtSec - 1) ?? null;
        if (display && display > 0n && signedE8 > 0n) {
          s.bps.push(Math.log(Number(signedE8) / Number(display)) * 10_000);
          if (s.bps.length > BASIS_SAMPLES) s.bps.shift();
        }
        s.lastAtSec = signedAtSec;
        samples.set(feedKey, s);
      }
      return basisOf(s.bps);
    },
    stop: off,
  };
}
