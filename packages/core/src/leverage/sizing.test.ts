// Ported from Masayume 68f7a09:packages/core/src/leverage/sizing.test.ts
import { describe, expect, it } from "vitest";
import golden from "./sizing.vectors.json";
import { budgetFor, effectiveMultipleMilli, equityOf, isKnockable, knockoutLine, markOverLevels, split, terms, walkBudget, walkQuantity, winIfRight, type YesLevel } from "./sizing";

const ONE = 1_000_000n;

interface Vector {
  name: string;
  leverageBps: number;
  premiumBps: number;
  stake: string;
  invert: boolean;
  lot: string;
  levels: { price: string; quantity: string }[];
  expect: { budget: string; quantityRaw: string; costRaw: string; filledRaw: string; limitYesRaw: string; stake: string; fronted: string; premium: string; winIfRight: string };
}

const { vectors } = golden as unknown as { vectors: Vector[] };

describe("the boost's arithmetic mirrors LeverageMath on the shared vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const levels: YesLevel[] = v.levels.map((l) => ({ priceRaw: BigInt(l.price), quantityRaw: BigInt(l.quantity) }));
      const budget = budgetFor(BigInt(v.stake), v.leverageBps, v.premiumBps);
      expect(budget).toBe(BigInt(v.expect.budget));
      const quantityRaw = walkBudget(levels, v.invert, ONE, budget, BigInt(v.lot));
      expect(quantityRaw).toBe(BigInt(v.expect.quantityRaw));
      const walk = walkQuantity(levels, v.invert, ONE, quantityRaw);
      expect(walk).toEqual({ costBase: BigInt(v.expect.costRaw), filledRaw: BigInt(v.expect.filledRaw), limitYesRaw: BigInt(v.expect.limitYesRaw) });
      const t = terms(walk.costBase, v.leverageBps, v.premiumBps);
      expect(t).toEqual({ stakeBase: BigInt(v.expect.stake), frontedBase: BigInt(v.expect.fronted), premiumBase: BigInt(v.expect.premium) });
      expect(t.stakeBase + t.frontedBase - t.premiumBase).toBe(walk.costBase);
      expect(winIfRight(quantityRaw, t.frontedBase)).toBe(BigInt(v.expect.winIfRight));
    });
  }
});

describe("the knock-out line and the split", () => {
  it("marks a unit under the ceiling-rounded walk and knocks out strictly under the line", () => {
    const bids: YesLevel[] = [{ priceRaw: 350_000n, quantityRaw: 300n * ONE }];
    const mark = markOverLevels(bids, false, ONE, 32n * ONE);
    expect(mark).toEqual({ markBase: 11_199_999n, filledRaw: 32n * ONE });
    expect(knockoutLine(10n * ONE, 12_000)).toBe(12n * ONE);
    expect(isKnockable(12n * ONE, 10n * ONE, 12_000)).toBe(false);
    expect(isKnockable(12n * ONE - 1n, 10n * ONE, 12_000)).toBe(true);
    expect(isKnockable(0n, 0n, 12_000)).toBe(false);
    expect(markOverLevels([], false, ONE, ONE)).toEqual({ markBase: 0n, filledRaw: 0n });
  });

  it("repays the reserve first", () => {
    expect(split(11_200_000n, 10n * ONE)).toEqual({ reclaimedBase: 10n * ONE, returnedBase: 1_200_000n });
    expect(split(8n * ONE, 10n * ONE)).toEqual({ reclaimedBase: 8n * ONE, returnedBase: 0n });
    expect(equityOf(18_559_999n, 10n * ONE)).toBe(8_559_999n);
    expect(equityOf(8n * ONE, 10n * ONE)).toBe(0n);
  });

  it("reports the multiple a position actually carries", () => {
    expect(effectiveMultipleMilli(10n * ONE, 10n * ONE)).toBe(2000);
    expect(effectiveMultipleMilli(9_999_295n, 19_998_592n)).toBe(3000);
    expect(effectiveMultipleMilli(0n, ONE)).toBe(0);
  });
});
