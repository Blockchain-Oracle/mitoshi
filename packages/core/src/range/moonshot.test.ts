// Ported from Masayume 68f7a09:packages/core/src/range/moonshot.test.ts
import { describe, expect, it } from "vitest";
import golden from "./moonshot.vectors.json";
import {
  MOONSHOT_AIM_LADDER,
  MOONSHOT_DIRECTIONS,
  MOONSHOT_RUNGS,
  aimToCall,
  callToAim,
  classifyRangeBand,
  moonshotPayoutCapBase,
  quoteMoonshot,
  rungHolds,
  solveStrike,
  targetProbE6,
  type MoonshotDirection,
  type MoonshotRung,
} from "./moonshot";
import { bandProbE6, floorStake, sideProbRaw } from "./pricing";

const ONE = 1_000_000n;
const NOW_MS = 1_788_400_000_000;
const PARAMS = { marginBps: 1_200, minProbRaw: 20_000n, maxProbRaw: 970_000n, maxPayoutCapBase: 500n * ONE };

interface Vector {
  name: string;
  direction: MoonshotDirection;
  multiple: MoonshotRung;
  openingPrint: string;
  centerQE6: number;
  sigmaE8: number;
  tauSec: number;
  marginBps: number;
  one: string;
  maxPayout: string;
  expect: { targetProbE6: string; strikePrint: string; lowPrint: string; highPrint: string; insideProbE6: string; probRaw: string; floorStake: string; multiplierMilli: number };
}

const { vectors } = golden as unknown as { vectors: Vector[] };

describe("the Moonshot solve mirrors the Python vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const one = BigInt(v.one);
      expect(targetProbE6(v.multiple, v.marginBps)).toBe(BigInt(v.expect.targetProbE6));
      const band = solveStrike({ direction: v.direction, multiple: v.multiple, openingPrint: BigInt(v.openingPrint), centerQE6: BigInt(v.centerQE6), sigmaE8: BigInt(v.sigmaE8), tauSec: v.tauSec, marginBps: v.marginBps, one });
      expect(band.strikePrint).toBe(BigInt(v.expect.strikePrint));
      expect(band.lowPrint).toBe(BigInt(v.expect.lowPrint));
      expect(band.highPrint).toBe(BigInt(v.expect.highPrint));
      const r = quoteMoonshot({
        direction: v.direction,
        multiple: v.multiple,
        openingPrint: BigInt(v.openingPrint),
        centerQE6: BigInt(v.centerQE6),
        sigmaE8: BigInt(v.sigmaE8),
        tauSec: v.tauSec,
        mode: { kind: "fixPayout", maxPayoutBase: BigInt(v.maxPayout) },
        params: { ...PARAMS, marginBps: v.marginBps },
        one,
        decimals: 6,
        nowMs: NOW_MS,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.quote.insideProbE6).toBe(BigInt(v.expect.insideProbE6));
      expect(r.quote.probRaw).toBe(BigInt(v.expect.probRaw));
      expect(r.quote.stakeBase).toBe(BigInt(v.expect.floorStake));
      expect(r.quote.multiplierMilli).toBe(v.expect.multiplierMilli);
      expect(r.quote.multiplierMilli).toBeGreaterThanOrEqual(v.multiple * 1000);
    });
  }
});

describe("the rung", () => {
  it("has the target probabilities doc 06 tabulated", () => {
    expect(targetProbE6(2, 1_200)).toBe(446_428n);
    expect(targetProbE6(3, 1_200)).toBe(297_619n);
    expect(targetProbE6(5, 1_200)).toBe(178_571n);
    expect(targetProbE6(10, 1_200)).toBe(89_285n);
    expect(targetProbE6(25, 1_200)).toBe(35_714n);
  });
  it("holds at the target for every rung but 3×, where the double ceiling costs one base unit", () => {
    for (const m of MOONSHOT_RUNGS) {
      const p = targetProbE6(m, 1_200);
      expect(rungHolds(p, m, ONE, 1_200)).toBe(m !== 3);
      expect(rungHolds(p - 1n, m, ONE, 1_200)).toBe(true);
      expect(rungHolds(p + 1n, m, ONE, 1_200)).toBe(false);
    }
  });
  it("once held at one unit, holds at every whole-unit payout", () => {
    const p = targetProbE6(3, 1_200) - 1n;
    for (const units of [1n, 2n, 7n, 33n, 100n, 500n]) expect(floorStake(units * ONE, p, ONE, 1_200) * 3n).toBeLessThanOrEqual(units * ONE);
  });
});

describe("the sweep: every rung × direction × horizon × centre prices inside the reserve's bounds", () => {
  const ASSETS = [
    { openingPrint: 7_673_523n, sigmaE8: 6_200n },
    { openingPrint: 243_512n, sigmaE8: 7_800n },
  ];
  const TAUS = [60, 300, 3_600, 172_800];
  const CENTRES = [30_000n, 453_500n, 500_000n, 620_000n, 970_000n];
  for (const asset of ASSETS) {
    for (const tauSec of TAUS) {
      for (const centerQE6 of CENTRES) {
        for (const multiple of MOONSHOT_RUNGS) {
          for (const direction of MOONSHOT_DIRECTIONS) {
            it(`${asset.openingPrint} τ=${tauSec} q=${centerQE6} ${direction} ×${multiple}`, () => {
              const band = solveStrike({ direction, multiple, openingPrint: asset.openingPrint, centerQE6, sigmaE8: asset.sigmaE8, tauSec, marginBps: 1_200, one: ONE });
              expect(band.lowPrint).toBeGreaterThan(0n);
              expect(band.highPrint).toBeGreaterThan(band.lowPrint);
              const probRaw = sideProbRaw(bandProbE6(asset.openingPrint, band.lowPrint, band.highPrint, centerQE6, asset.sigmaE8, tauSec), "inside", ONE);
              expect(probRaw).toBeGreaterThanOrEqual(PARAMS.minProbRaw);
              expect(probRaw).toBeLessThanOrEqual(PARAMS.maxProbRaw);
              expect(rungHolds(probRaw, multiple, ONE, 1_200)).toBe(true);
              // A cent nearer the opening print would break the rung: the nudge stopped at the first cent that holds.
              const nearer = direction === "long" ? band.strikePrint - 1n : band.strikePrint + 1n;
              const nearerEdges = direction === "long" ? { low: nearer, high: band.highPrint } : { low: band.lowPrint, high: nearer };
              const nearerProb = sideProbRaw(bandProbE6(asset.openingPrint, nearerEdges.low, nearerEdges.high, centerQE6, asset.sigmaE8, tauSec), "inside", ONE);
              expect(nearerProb).toBeGreaterThanOrEqual(probRaw);
              const r = quoteMoonshot({ direction, multiple, openingPrint: asset.openingPrint, centerQE6, sigmaE8: asset.sigmaE8, tauSec, mode: { kind: "fixStake", stakeBase: ONE }, params: PARAMS, one: ONE, decimals: 6, nowMs: NOW_MS });
              expect(r.ok).toBe(true);
              if (r.ok) expect(r.quote.multiplierMilli).toBeGreaterThanOrEqual(multiple * 1000 - 1);
            });
          }
        }
      }
    }
  }
});

describe("the shape of a round says what it is", () => {
  const open = 7_673_523n;
  it("recognises both directions and leaves a band alone", () => {
    expect(classifyRangeBand(open, 7_680_312n, open * 4n)).toEqual({ kind: "moonshot", direction: "long", strikePrint: 7_680_312n });
    expect(classifyRangeBand(open, 1n, 7_666_734n)).toEqual({ kind: "moonshot", direction: "short", strikePrint: 7_666_734n });
    expect(classifyRangeBand(open, open - 3_000n, open + 3_000n)).toEqual({ kind: "range" });
  });
  it("solves to a band that classifies back to its call", () => {
    for (const direction of MOONSHOT_DIRECTIONS) {
      const band = solveStrike({ direction, multiple: 5, openingPrint: open, centerQE6: 500_000n, sigmaE8: 6_200n, tauSec: 240, marginBps: 1_200, one: ONE });
      expect(classifyRangeBand(open, band.lowPrint, band.highPrint)).toEqual({ kind: "moonshot", direction, strikePrint: band.strikePrint });
    }
  });
});

describe("the ladder and the caps", () => {
  it("maps Pips' aim ladder both ways", () => {
    for (const aim of MOONSHOT_AIM_LADDER) expect(callToAim(aimToCall(aim))).toBe(aim);
    expect(aimToCall(5)).toEqual({ direction: "long", multiple: 5 });
    expect(aimToCall(-25)).toEqual({ direction: "short", multiple: 25 });
    expect(() => aimToCall(7)).toThrow();
  });
  it("caps the long rungs under the contract's cap and leaves the rest to it", () => {
    expect(moonshotPayoutCapBase(25, 500n * ONE, ONE)).toBe(100n * ONE);
    expect(moonshotPayoutCapBase(10, 500n * ONE, ONE)).toBe(200n * ONE);
    expect(moonshotPayoutCapBase(5, 500n * ONE, ONE)).toBe(500n * ONE);
    expect(moonshotPayoutCapBase(25, 50n * ONE, ONE)).toBe(50n * ONE);
  });
});
