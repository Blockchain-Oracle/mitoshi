// Ported from Owarine ecb7565b:web/src/features/terminal/format.test.ts — in dollars.
import { describe, expect, it } from "vitest";
import { centsOf, fixedText, livePnlText, money, multipleOf, untilText } from "./format";

describe("terminal numbers", () => {
  it("rounds the shown decimal half up, not the double beneath it", () => {
    expect((191.475).toFixed(2)).toBe("191.47");
    expect(fixedText(191.475, 2)).toBe("191.48");
    expect(fixedText(-38.25, 1)).toBe("38.3");
    expect(fixedText(0.1 + 0.2, 2)).toBe("0.30");
  });
  it("keeps Tradash's magnitude decimals with a true minus", () => {
    expect(livePnlText(41_200n)).toBe("+$0.0412");
    expect(livePnlText(12_345_000n)).toBe("+$12.345");
    expect(livePnlText(-1_204_500_000n)).toBe("−$1,204.50");
    expect(money(24_540_000n)).toBe("$24.54");
    expect(money(-5_740_000n, true)).toBe("−$5.74");
  });
  it("words prices, multiples and countdowns", () => {
    expect(multipleOf(523)).toBe("1.91×");
    expect(multipleOf(50)).toBe("20×");
    expect(multipleOf(0)).toBe("–");
    expect(centsOf(523)).toBe("52.3¢");
    expect(centsOf(520)).toBe("52¢");
    expect(untilText(1_065, 1_000)).toBe("1:05");
    expect(untilText(1_012, 1_000)).toBe("12s");
  });
});
