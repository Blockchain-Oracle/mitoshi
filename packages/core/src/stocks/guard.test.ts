import { describe, expect, it } from "vitest";
import vectors from "./guard.vectors.json";
import { DEFAULT_GUARD, WAD, allowed, band, inCorporateActionWindow, isqrt, sessionRule, sqrtFromTokenPrice, tokenPriceE18, tokenPriceFromSqrt, usdBand } from "./guard";

const B = (s: string) => BigInt(s);

describe("guard vectors (shared with GuardMath.t.sol)", () => {
  it("token price, sqrt, inverse and bands match", () => {
    for (const v of vectors.tokenPrice) expect(tokenPriceE18(B(v.share), B(v.mult)), v.name).toBe(B(v.price));
    for (const v of vectors.sqrt) expect(sqrtFromTokenPrice(B(v.price))).toBe(B(v.sqrt));
    for (const v of vectors.fromSqrt) expect(tokenPriceFromSqrt(B(v.sqrt))).toBe(B(v.price));
    for (const v of vectors.band) expect(band(B(v.price), v.bps)).toEqual({ lo: B(v.lo), hi: B(v.hi) });
    for (const v of vectors.allowed) expect(allowed(B(v.pre), B(v.post), B(v.lo), B(v.hi)), v.name).toBe(v.ok);
  });
});

describe("guard maths", () => {
  it("multiplies the share price by the multiplier (CRWD 4-for-1: one token = four shares)", () => {
    const crwd = vectors.tokenPrice.find((v) => v.name === "CRWD")!;
    expect(B(crwd.price)).toBe(B(crwd.share) * 4n);
    expect(B(crwd.price)).toBe(B(vectors.tokenPrice.find((v) => v.name === "CRWD-pre-split")!.price));
  });

  it("orients the band: a higher token price is a lower v4 sqrt price", () => {
    for (const v of vectors.band) {
      const mid = sqrtFromTokenPrice(B(v.price));
      expect(B(v.lo) < mid && mid < B(v.hi)).toBe(true);
    }
  });

  it("agrees with a floating-point sqrt and roundtrips within rounding", () => {
    for (let i = 0; i < 500; i++) {
      const p = BigInt(Math.floor(Math.random() * 1e9) + 1) * 10n ** BigInt(9 + (i % 12));
      const s = sqrtFromTokenPrice(p);
      const approx = Math.sqrt(2 ** 192 * (1e18 / Number(p)));
      expect(Math.abs(Number(s) / approx - 1)).toBeLessThan(1e-9);
      const back = tokenPriceFromSqrt(s);
      expect(back >= p).toBe(true); // floor(sqrt) makes the implied price round up
      expect((back - p) * 10n ** 12n <= p).toBe(true);
    }
  });

  it("isqrt is the floor square root", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, (1n << 200n) + 12345n]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true);
    }
  });

  it("maps sessions to bands like GuardTypes.sessionRule, REFUSE closes off-hours", () => {
    expect(sessionRule(DEFAULT_GUARD, "REGULAR")).toEqual({ bps: 150, maxAge: 120, open: true });
    expect(sessionRule(DEFAULT_GUARD, "EXTENDED")).toEqual({ bps: 300, maxAge: 120, open: true });
    expect(sessionRule(DEFAULT_GUARD, "CLOSED")).toEqual({ bps: 500, maxAge: 345_600, open: true });
    expect(sessionRule({ ...DEFAULT_GUARD, offHoursMode: "REFUSE" }, "UNKNOWN").open).toBe(false);
  });

  it("detects the corporate-action window on both sides of effectiveAt", () => {
    expect(inCorporateActionWindow(1_782_999_000n - 899n, 1_782_999_000n, 900)).toBe(true);
    expect(inCorporateActionWindow(1_782_999_000n + 899n, 1_782_999_000n, 900)).toBe(true);
    expect(inCorporateActionWindow(1_782_999_000n + 900n, 1_782_999_000n, 900)).toBe(false);
    expect(inCorporateActionWindow(5n, 1n, 900)).toBe(false);
  });

  it("gives the USD band for the CTA", () => {
    expect(usdBand(100n * WAD, 150)).toEqual({ minE18: 985n * WAD / 10n, maxE18: 1015n * WAD / 10n });
  });
});
