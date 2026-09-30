import { describe, expect, it } from "vitest";
import vectors from "./fair.vectors.json";
import { normalCdf, TRADING_YEAR_SEC } from "./agari";
import { buildFairVectors } from "./fairVectors";
import { CALENDAR_YEAR_SEC, fairProbUpE6, fairYesTicksE6, FairValueError, sigmaE8FromBps } from "./fair";
import { lnWad } from "./lnwad";

const E8 = 100_000_000n;
const WAD = 10n ** 18n;

describe("shared vectors (also replayed by contracts/test/fair/FairValue.t.sol)", () => {
  it("the committed fair.vectors.json is exactly what the builder produces", () => {
    expect(JSON.parse(JSON.stringify(buildFairVectors()))).toEqual(vectors);
  });

  it("stays within one tick and 0.06 percentage points of Agari's float model on every row", () => {
    expect(vectors.maxTicksDiff).toBeLessThanOrEqual(1);
    expect(vectors.maxUpE6Diff).toBeLessThanOrEqual(600);
    for (let i = 0; i < vectors.upE6.length; i++) {
      expect(Math.abs(vectors.upE6[i]! - vectors.agariUpE6[i]!)).toBeLessThanOrEqual(vectors.maxUpE6Diff);
    }
  });
});

describe("the integer model", () => {
  const sigma = sigmaE8FromBps(4_500, TRADING_YEAR_SEC);

  it("quotes an unmoved price just above even (Agari: ties go Up) and saturates at the clamp", () => {
    expect(fairYesTicksE6(fairProbUpE6(400n * E8, 400n * E8, sigma, 150), 20)).toBe(501);
    expect(fairYesTicksE6(fairProbUpE6(440n * E8, 400n * E8, sigma, 150), 20)).toBe(980);
    expect(fairYesTicksE6(fairProbUpE6(360n * E8, 400n * E8, sigma, 150), 20)).toBe(20);
  });

  it("is symmetric in the log-return and less certain with more time left", () => {
    const up = fairProbUpE6(404n * E8, 400n * E8, sigma, 150);
    const down = fairProbUpE6((400n * 400n * E8) / 404n, 400n * E8, sigma, 150);
    expect(Number(up + down - 1_000_000n)).toBeLessThanOrEqual(2);
    expect(fairProbUpE6(401n * E8, 400n * E8, sigma, 30)).toBeGreaterThan(fairProbUpE6(401n * E8, 400n * E8, sigma, 3_000));
  });

  it("refuses a non-positive price by name before the logarithm (D-054)", () => {
    expect(() => fairProbUpE6(0n, 400n * E8, sigma, 150)).toThrow(FairValueError);
    expect(() => fairProbUpE6(400n * E8, -1n, sigma, 150)).toThrow(FairValueError);
  });

  it("converts an annual σ to the guard's per-√second figure on either clock", () => {
    expect(sigmaE8FromBps(5_000, CALENDAR_YEAR_SEC)).toBe(8_903n);
    expect(sigmaE8FromBps(5_000, TRADING_YEAR_SEC)).toBe(20_590n);
  });

  it("lnWad matches the true logarithm to within Solady's approximation", () => {
    for (const [x, ln] of [[WAD, 0], [2n * WAD, Math.LN2], [WAD / 3n, Math.log(1 / 3)], [123_456_789n * WAD, Math.log(123_456_789)]] as const) {
      expect(Math.abs(Number(lnWad(x)) / 1e18 - ln)).toBeLessThan(1e-12);
    }
    expect(() => lnWad(0n)).toThrow("LnWadUndefined");
  });

  it("Agari's CDF is the normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });
});
