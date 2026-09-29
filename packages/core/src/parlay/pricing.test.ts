// Ported from Masayume 68f7a09:packages/core/src/parlay/pricing.test.ts
import { describe, expect, it } from "vitest";
import type { BookLevelView } from "../types/trading";
import golden from "./pricing.vectors.json";
import { combineProb, floorStake, legPriceOverLevels, maxPayoutForStake, quoteParlay, type QuoteLeg } from "./pricing";

const ONE = 1_000_000n;
const NOW_MS = 1_788_400_000_000;

interface Vector {
  name: string;
  marginBps: number;
  correlationBps: number;
  legs: { priceRaw: string; expirySec: number }[];
  maxPayout: string;
  expect: { combinedProbRaw: string; floorStake: string };
}

const { vectors } = golden as unknown as { vectors: Vector[] };

/** A book deep enough that every leg prices at `priceRaw` whatever the depth. */
const deepAsk = (raw: bigint): BookLevelView[] => [{ priceRaw: raw, priceBps: Number(raw / 100n), quantityRaw: 100_000n * ONE }];

const PARAMS = { marginBps: 1_200, correlationBps: 4_000, priceDepthRaw: 20n * ONE, minCombinedProbRaw: 20_000n, maxPayoutCapBase: 500n * ONE, maxLegs: 3 };

describe("the parlay arithmetic mirrors ParlayMath on the shared vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const prices = v.legs.map((leg) => BigInt(leg.priceRaw));
      const expiries = v.legs.map((leg) => leg.expirySec);
      const combined = combineProb(prices, expiries, ONE, v.correlationBps);
      expect(combined).toBe(BigInt(v.expect.combinedProbRaw));
      expect(floorStake(BigInt(v.maxPayout), combined, ONE, v.marginBps)).toBe(BigInt(v.expect.floorStake));
    });
  }
});

describe("legPriceOverLevels", () => {
  const asks: BookLevelView[] = [
    { priceRaw: 600_000n, priceBps: 6_000, quantityRaw: 50n * ONE },
    { priceRaw: 620_000n, priceBps: 6_200, quantityRaw: 50n * ONE },
  ];
  it("walks the levels cost-weighted and rounds up", () => {
    expect(legPriceOverLevels(asks, 100n * ONE)).toEqual({ priceRaw: 610_000n, filledRaw: 100n * ONE });
    expect(legPriceOverLevels(asks, 20n * ONE)).toEqual({ priceRaw: 600_000n, filledRaw: 20n * ONE });
    expect(legPriceOverLevels(asks, 150n * ONE)).toEqual({ priceRaw: 610_000n, filledRaw: 100n * ONE });
    expect(legPriceOverLevels([], ONE)).toEqual({ priceRaw: 0n, filledRaw: 0n });
    const odd: BookLevelView[] = [
      { priceRaw: 600_000n, priceBps: 6_000, quantityRaw: 1n },
      { priceRaw: 600_001n, priceBps: 6_000, quantityRaw: 2n },
    ];
    expect(legPriceOverLevels(odd, 3n).priceRaw).toBe(600_001n);
  });
});

describe("maxPayoutForStake inverts floorStake exactly", () => {
  it("finds the largest payout whose floor fits the stake", () => {
    const combined = 252_000n;
    const payout = maxPayoutForStake(28_224_000n, combined, ONE, 1_200);
    expect(floorStake(payout, combined, ONE, 1_200) <= 28_224_000n).toBe(true);
    expect(floorStake(payout + 1n, combined, ONE, 1_200) > 28_224_000n).toBe(true);
    expect(payout).toBe(100n * ONE);
    expect(maxPayoutForStake(0n, combined, ONE, 1_200)).toBe(0n);
    expect(maxPayoutForStake(ONE, 0n, ONE, 1_200)).toBe(0n);
  });
});

describe("quoteParlay", () => {
  const legs: QuoteLeg[] = [
    { expirySec: 300, asks: deepAsk(600_000n) },
    { expirySec: 600, asks: deepAsk(420_000n) },
  ];
  const base = { params: PARAMS, one: ONE, decimals: 6, nowMs: NOW_MS };

  it("prices a fixed payout to the vectors' stake", () => {
    const result = quoteParlay({ ...base, legs, mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.stakeBase).toBe(28_224_000n);
    expect(result.quote.combinedProbRaw).toBe(252_000n);
    expect(result.quote.legProbBps).toEqual([6_000, 4_200]);
    expect(result.quote.correlated).toBe(false);
    expect(result.quote.multiplierMilli).toBe(3_543);
  });

  it("solves a fixed stake to the payout the chain would accept", () => {
    const result = quoteParlay({ ...base, legs, mode: { kind: "fixStake", stakeBase: 28_224_000n } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.maxPayoutBase).toBe(100n * ONE);
    expect(result.quote.stakeBase).toBe(28_224_000n);
  });

  it("re-prices a fixed stake over the payout it buys when the book walks", () => {
    const walking: QuoteLeg[] = [
      {
        expirySec: 300,
        asks: [
          { priceRaw: 600_000n, priceBps: 6_000, quantityRaw: 50n * ONE },
          { priceRaw: 700_000n, priceBps: 7_000, quantityRaw: 500n * ONE },
        ],
      },
      { expirySec: 600, asks: deepAsk(420_000n) },
    ];
    // Over 20 contracts the first leg is 0.60 and 28.224 buys 100; over 100 it is 0.65, so the payout falls to what 0.65 x 0.42 affords.
    const result = quoteParlay({ ...base, legs: walking, mode: { kind: "fixStake", stakeBase: 28_224_000n } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.legPricesRaw[0]).toBe(650_000n);
    expect(result.quote.maxPayoutBase < 100n * ONE).toBe(true);
    expect(result.quote.stakeBase <= 28_224_000n).toBe(true);
  });

  it("marks a shared settlement instant as correlated and floors it", () => {
    const same: QuoteLeg[] = [
      { expirySec: 600, asks: deepAsk(150_000n) },
      { expirySec: 600, asks: deepAsk(150_000n) },
    ];
    const result = quoteParlay({ ...base, legs: same, mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.correlated).toBe(true);
    expect(result.quote.rawCombinedProbRaw).toBe(22_500n);
    expect(result.quote.combinedProbRaw).toBe(60_000n);
  });

  it("refuses what the contract refuses", () => {
    const thin: QuoteLeg[] = [{ expirySec: 300, asks: [{ priceRaw: 600_000n, priceBps: 6_000, quantityRaw: 5n * ONE }] }, legs[1] as QuoteLeg];
    expect(quoteParlay({ ...base, legs: thin, mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } })).toEqual({
      ok: false,
      refusal: { kind: "thin-book", legIdx: 0, availableRaw: 5n * ONE, neededRaw: 100n * ONE },
    });
    const longShot: QuoteLeg[] = [
      { expirySec: 300, asks: deepAsk(100_000n) },
      { expirySec: 600, asks: deepAsk(100_000n) },
    ];
    expect(quoteParlay({ ...base, legs: longShot, mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } })).toMatchObject({ ok: false, refusal: { kind: "long-shot" } });
    const certain: QuoteLeg[] = [
      { expirySec: 300, asks: deepAsk(990_000n) },
      { expirySec: 600, asks: deepAsk(990_000n) },
    ];
    expect(quoteParlay({ ...base, legs: certain, mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } })).toMatchObject({ ok: false, refusal: { kind: "underpriced" } });
    expect(quoteParlay({ ...base, legs: [legs[0] as QuoteLeg], mode: { kind: "fixPayout", maxPayoutBase: 100n * ONE } })).toMatchObject({ ok: false, refusal: { kind: "legs" } });
    expect(quoteParlay({ ...base, legs, mode: { kind: "fixPayout", maxPayoutBase: 0n } })).toEqual({ ok: false, refusal: { kind: "zero" } });
    expect(quoteParlay({ ...base, legs, mode: { kind: "fixPayout", maxPayoutBase: 501n * ONE } })).toMatchObject({ ok: false, refusal: { kind: "over-payout-cap" } });
  });
});
