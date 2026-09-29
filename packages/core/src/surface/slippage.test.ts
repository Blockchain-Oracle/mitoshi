// Ported from Masayume 68f7a09:packages/core/src/surface/slippage.test.ts
import { describe, expect, it } from "vitest";
import type { BookLevelView } from "../types/trading";
import { slippageLadder, stakeLadder } from "./slippage";

const D = 6;
const UNIT = 10n ** BigInt(D);
const LOT = UNIT / 100n;
const level = (cents: number, contracts: number): BookLevelView => ({
  priceRaw: BigInt(cents) * (UNIT / 100n),
  priceBps: cents * 100,
  quantityRaw: BigInt(contracts) * UNIT,
});
const ASKS = [level(60, 10), level(62, 20), level(65, 50)];

describe("slippageLadder", () => {
  it("prices a stake that sits inside the top level at the top, with no slippage", () => {
    const [row] = slippageLadder(ASKS, [5n * UNIT], D, LOT, 0);
    expect(row!.contractsRaw).toBe(8_330_000n);
    expect(row!.costBase).toBeLessThanOrEqual(5n * UNIT);
    expect(row!.avgPriceBps).toBe(6_000);
    expect(row!.worstPriceBps).toBe(6_000);
    expect(row!.slippageBps).toBe(0);
    expect(row!.exhausted).toBe(false);
    expect(row!.payoutIfRightBase).toBe(8_330_000n);
  });

  it("walks deeper as the stake grows and reports the average above the top", () => {
    const rows = slippageLadder(ASKS, [5n * UNIT, 10n * UNIT, 25n * UNIT], D, LOT, 0);
    const avgs = rows.map((r) => r.avgPriceBps!);
    expect(avgs[1]).toBeGreaterThan(avgs[0]!);
    expect(avgs[2]).toBeGreaterThan(avgs[1]!);
    expect(rows[1]!.worstPriceBps).toBe(6_200);
    expect(rows[2]!.worstPriceBps).toBe(6_500);
    expect(rows[2]!.slippageBps).toBeGreaterThan(0);
    for (const row of rows) expect(row.costBase).toBeLessThanOrEqual(row.stakeBase);
  });

  it("flags a stake the visible book cannot absorb", () => {
    // 10×0.60 + 20×0.62 + 50×0.65 = 50.9 — everything visible costs less than 100.
    const [row] = slippageLadder(ASKS, [100n * UNIT], D, LOT, 0);
    expect(row!.exhausted).toBe(true);
    expect(row!.contractsRaw).toBe(80n * UNIT);
    expect(row!.costBase).toBe(50_900_000n);
  });

  it("takes the settlement fee off the payout and never assumes one", () => {
    const [withFee] = slippageLadder(ASKS, [5n * UNIT], D, LOT, 100);
    expect(withFee!.payoutIfRightBase).toBe(8_246_700n);
    const [unknown] = slippageLadder(ASKS, [5n * UNIT], D, LOT, null);
    expect(unknown!.payoutIfRightBase).toBeNull();
  });

  it("buys nothing off an empty book and says the book is exhausted", () => {
    const rows = slippageLadder([], stakeLadder(D), D, LOT, 0);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.contractsRaw).toBe(0n);
      expect(row.avgPriceBps).toBeNull();
      expect(row.exhausted).toBe(true);
    }
  });
});
