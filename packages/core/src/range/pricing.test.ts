// Ported from Masayume 68f7a09:packages/core/src/range/pricing.test.ts
import { describe, expect, it } from "vitest";
import golden from "./pricing.vectors.json";
import { bandProbE6, cdfE6, floorStake, isqrt, maxPayoutForStake, probitE4, quoteRange, sideProbRaw, stdE8, zOf } from "./pricing";
import type { RangeSide } from "./types";

const ONE = 1_000_000n;
const P0 = 7_673_523n;
const NOW_MS = 1_788_400_000_000;

interface Vector {
  name: string;
  openingPrint: string;
  lowPrint: string;
  highPrint: string;
  centerQE6: number;
  sigmaE8: number;
  tauSec: number;
  side: RangeSide;
  marginBps: number;
  maxPayout: string;
  expect: { insideProbE6: string; probRaw: string; floorStake: string };
}

const { vectors } = golden as unknown as { vectors: Vector[] };

describe("the range arithmetic mirrors RangeMath on the shared vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const inside = bandProbE6(BigInt(v.openingPrint), BigInt(v.lowPrint), BigInt(v.highPrint), BigInt(v.centerQE6), BigInt(v.sigmaE8), v.tauSec);
      expect(inside).toBe(BigInt(v.expect.insideProbE6));
      const probRaw = sideProbRaw(inside, v.side, ONE);
      expect(probRaw).toBe(BigInt(v.expect.probRaw));
      expect(floorStake(BigInt(v.maxPayout), probRaw, ONE, v.marginBps)).toBe(BigInt(v.expect.floorStake));
    });
  }
});

/** Abramowitz–Stegun 7.1.26 — an erf good to 1.5e-7, independent of the table. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

describe("the table", () => {
  it("tracks the normal CDF within 1e-4 across the whole range", () => {
    for (let z = -4.2; z <= 4.2; z += 0.0137) {
      const zE4 = BigInt(Math.round(z * 10_000));
      const exact = Math.min(1, Math.max(0, phi(z))) * 1e6;
      expect(Math.abs(Number(cdfE6(zE4)) - exact)).toBeLessThanOrEqual(100);
    }
  });
  it("is symmetric and saturates", () => {
    expect(cdfE6(0n)).toBe(500_000n);
    expect(cdfE6(10_000n) + cdfE6(-10_000n)).toBe(1_000_000n);
    expect(cdfE6(40_000n)).toBe(1_000_000n);
    expect(cdfE6(-99_999n)).toBe(0n);
  });
  it("inverts within 0.001 sigma", () => {
    for (let z = -35_000n; z <= 35_000n; z += 625n) {
      const back = probitE4(cdfE6(z));
      expect(back > z ? back - z : z - back).toBeLessThanOrEqual(10n);
    }
    expect(probitE4(500_000n)).toBe(0n);
    expect(probitE4(999_999n)).toBe(40_000n);
    expect(probitE4(1n)).toBe(-40_000n);
  });
});

describe("the pieces", () => {
  it("root and standard deviation", () => {
    expect(isqrt(2_400_000n)).toBe(1_549n);
    expect(isqrt(1n << 200n)).toBe(1n << 100n);
    expect(stdE8(6_200n, 240)).toBe(96_038n);
    expect(stdE8(6_200n, 300)).toBe(107_384n);
  });
  it("z truncates toward zero like the EVM", () => {
    const std = stdE8(6_200n, 240);
    expect(zOf(P0 + 3_000n, P0, std)).toBe(4_070n);
    expect(zOf(P0 - 3_000n, P0, std)).toBe(-4_070n);
  });
  it("the stake solve never exceeds the stake", () => {
    for (const stake of [1_000_000n, 5_000_000n, 33_333_333n, 100_000_000n]) {
      for (const prob of [39n, 20_000n, 315_946n, 684_054n, 969_999n]) {
        const payout = maxPayoutForStake(stake, prob, ONE, 1_200);
        expect(floorStake(payout, prob, ONE, 1_200)).toBeLessThanOrEqual(stake);
        expect(floorStake(payout + 1n, prob, ONE, 1_200)).toBeGreaterThan(stake);
      }
    }
  });
});

describe("quoteRange", () => {
  const params = { marginBps: 1_200, minProbRaw: 20_000n, maxProbRaw: 970_000n, maxPayoutCapBase: 500n * ONE };
  const basis = { openingPrint: P0, centerQE6: 500_000n, sigmaE8: 6_200n, tauSec: 240, params, one: ONE, decimals: 6, nowMs: NOW_MS };
  const band = { lowPrint: P0 - 3_000n, highPrint: P0 + 3_000n };

  it("prices the shared band for a fixed payout", () => {
    const r = quoteRange({ ...basis, ...band, side: "inside", mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } });
    expect(r.ok && r.quote.probRaw).toBe(315_946n);
    expect(r.ok && r.quote.stakeBase).toBe(35_385_952n);
    expect(r.ok && r.quote.multiplierMilli).toBe(2_825);
  });
  it("solves a fixed stake to the largest payout the floor allows", () => {
    const r = quoteRange({ ...basis, ...band, side: "outside", mode: { kind: "fixStake", stakeBase: 10n * ONE } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.stakeBase).toBeLessThanOrEqual(10n * ONE);
    expect(floorStake(r.quote.maxPayoutBase + 1n, r.quote.probRaw, ONE, 1_200)).toBeGreaterThan(10n * ONE);
  });
  it("refuses what the contract refuses", () => {
    expect(quoteRange({ ...basis, lowPrint: P0, highPrint: P0, side: "inside", mode: { kind: "fixPayout", maxPayoutBase: ONE } })).toMatchObject({ ok: false, refusal: { kind: "band" } });
    expect(quoteRange({ ...basis, ...band, side: "inside", mode: { kind: "fixPayout", maxPayoutBase: 0n } })).toMatchObject({ ok: false, refusal: { kind: "zero" } });
    expect(quoteRange({ ...basis, lowPrint: P0, highPrint: P0 + 1n, side: "inside", mode: { kind: "fixPayout", maxPayoutBase: ONE } })).toMatchObject({ ok: false, refusal: { kind: "long-shot" } });
    expect(quoteRange({ ...basis, lowPrint: P0 - 400_000n, highPrint: P0 + 400_000n, side: "inside", mode: { kind: "fixPayout", maxPayoutBase: ONE } })).toMatchObject({ ok: false, refusal: { kind: "near-certain" } });
    expect(quoteRange({ ...basis, ...band, side: "inside", mode: { kind: "fixPayout", maxPayoutBase: 501n * ONE } })).toMatchObject({ ok: false, refusal: { kind: "over-payout-cap" } });
    expect(quoteRange({ ...basis, ...band, side: "inside", mode: { kind: "fixStake", stakeBase: 1n } })).toMatchObject({ ok: false, refusal: { kind: "underpriced" } });
  });
});
