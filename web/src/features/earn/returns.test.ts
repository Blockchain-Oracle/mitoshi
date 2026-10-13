import { describe, expect, it } from "vitest";
import { ageDays, changeBps, hundredBecame, rangeReturn, returnRead, sinceLaunch } from "./returns";

const ONE = 1_000_000n;

describe("returns", () => {
  it("since launch reads the live share price against par, with sign and tone", () => {
    expect(sinceLaunch(989_129n, ONE)).toEqual({ bps: -109, tone: "down", text: "−1.09%" });
    expect(sinceLaunch(1_012_345n, ONE)).toEqual({ bps: 123, tone: "up", text: "+1.23%" });
  });

  it("a change that rounds to zero is flat, never −0.00%", () => {
    expect(sinceLaunch(999_996n, ONE)).toEqual({ bps: 0, tone: "flat", text: "0.00%" });
    expect(sinceLaunch(ONE, ONE).text).toBe("0.00%");
  });

  it("rounds half away from zero to the basis point", () => {
    expect(changeBps(ONE, 1_000_050n)).toBe(1);
    expect(changeBps(ONE, 999_950n)).toBe(-1);
    expect(changeBps(ONE, 1_000_049n)).toBe(0);
    expect(returnRead(-5).text).toBe("−0.05%");
    expect(returnRead(1234).text).toBe("+12.34%");
  });

  it("a range needs two points and reads last over first", () => {
    expect(rangeReturn([{ sharePriceRaw: ONE }])).toBeNull();
    expect(rangeReturn([{ sharePriceRaw: 998_819n }, { sharePriceRaw: 995_000n }, { sharePriceRaw: 989_129n }])?.text).toBe("−0.97%");
  });

  it("what $100 did: 100 × last / first, floored to the cent", () => {
    expect(hundredBecame(ONE, 989_129n, 6)).toBe(98_910_000n);
    expect(hundredBecame(998_819n, 989_129n, 6)).toBe(99_020_000n);
    expect(hundredBecame(0n, ONE, 6)).toBe(0n);
  });

  it("age in whole days", () => {
    expect(ageDays(0, 14 * 86_400 + 5)).toBe(14);
    expect(ageDays(100, 50)).toBe(0);
  });
});
