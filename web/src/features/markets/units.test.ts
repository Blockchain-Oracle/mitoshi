import { describe, expect, it } from "vitest";
import { usdLine } from "./units";

const e8 = (dollars: number) => BigInt(Math.round(dollars * 1e8));

describe("usdLine (Owarine 90a91d71 hero/units.ts, R4-3)", () => {
  it("keeps cents under $10,000 and whole dollars from there", () => {
    expect(usdLine(e8(182.37))).toBe("$182.37");
    expect(usdLine(e8(64_210.37))).toBe("$64,210");
  });
  it("prints a move at its line's scale, so a stock's distance never reads +$0", () => {
    expect(usdLine(e8(0.42), e8(182.37))).toBe("$0.42");
    expect(usdLine(e8(12.6), e8(64_210))).toBe("$12");
  });
  it("shows five decimals under a dollar, truncated as every print is", () => {
    expect(usdLine(e8(0.123456))).toBe("$0.12345");
  });
});
