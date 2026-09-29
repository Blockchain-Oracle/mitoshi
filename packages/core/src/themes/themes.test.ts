import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import { isValidCreatorFee, isValidWeightSet, normalizeWeights } from "./index";

describe("theme weights", () => {
  it.each(vectors.normalize)("normalizes $scores", (v) => {
    const rows = normalizeWeights(Object.entries(v.scores).map(([symbol, score]) => ({ symbol, score: BigInt(score) })));
    expect(Object.fromEntries(rows.map((r) => [r.symbol, r.bps]))).toEqual(v.bps);
    expect(isValidWeightSet(rows)).toBe(true);
  });

  it("refuses bad sets and fees over the cap", () => {
    expect(isValidWeightSet([{ symbol: "TSLA", bps: 9_999 }])).toBe(false);
    expect(isValidWeightSet([{ symbol: "TSLA", bps: 5_000 }, { symbol: "TSLA", bps: 5_000 }])).toBe(false);
    expect(() => normalizeWeights([{ symbol: "TSLA", score: 0n }])).toThrow();
    expect(isValidCreatorFee(50)).toBe(true);
    expect(isValidCreatorFee(51)).toBe(false);
  });
});
