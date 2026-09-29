import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import { quoteAgeSec, rawAmountOf, tokenPriceE18, uiAmountOf, uiMultiplierAt } from "./index";

describe("stock-token units", () => {
  it.each(vectors.multiplier)("raw $raw at $multiplierE18 → ui $ui", (v) => {
    expect(uiAmountOf(BigInt(v.raw), BigInt(v.multiplierE18))).toBe(BigInt(v.ui));
    expect(rawAmountOf(BigInt(v.ui), BigInt(v.multiplierE18))).toBe(BigInt(v.rawBack));
  });

  it("multiplies the share price (× not ÷)", () => {
    for (const v of vectors.tokenPrice) expect(tokenPriceE18(BigInt(v.sharePriceE18), BigInt(v.multiplierE18))).toBe(BigInt(v.tokenPriceE18));
  });

  it("switches to the pending multiplier at effectiveAt, and ages quotes in whole seconds", () => {
    const state = { currentE18: 10n ** 18n, pendingE18: 4n * 10n ** 18n, effectiveAtSec: 1_782_999_000 };
    expect(uiMultiplierAt(state, 1_782_998_999)).toBe(10n ** 18n);
    expect(uiMultiplierAt(state, 1_782_999_000)).toBe(4n * 10n ** 18n);
    expect(uiMultiplierAt({ ...state, effectiveAtSec: 0 }, 2_000_000_000)).toBe(10n ** 18n);
    expect(quoteAgeSec(1_000, 3_999)).toBe(2);
    expect(quoteAgeSec(5_000, 1_000)).toBe(0);
  });
});
