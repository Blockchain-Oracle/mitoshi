import { describe, expect, it } from "vitest";
import { tradeRedirect } from "./route";

describe("the terminal's address", () => {
  it("sends /trade to the last symbol traded here, else BTC", () => {
    expect(tradeRedirect("/trade", undefined)).toBe("/trade/BTC");
    expect(tradeRedirect("/trade", "tsla")).toBe("/trade/TSLA");
    expect(tradeRedirect("/trade/", "NOPE")).toBe("/trade/BTC");
  });
  it("normalises a listed symbol to upper case and leaves the rest to the page", () => {
    expect(tradeRedirect("/trade/eth", undefined)).toBe("/trade/ETH");
    expect(tradeRedirect("/trade/ETH", undefined)).toBeNull();
    expect(tradeRedirect("/trade/xyz", undefined)).toBeNull();
    expect(tradeRedirect("/trade-from-x", undefined)).toBeNull();
  });
});
