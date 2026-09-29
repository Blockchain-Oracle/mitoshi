import { describe, expect, it } from "vitest";
import { WAD, sqrtFromTokenPrice, tokenPriceFromSqrt } from "./guard";
import { planHouse } from "./housePlan";
import { getSqrtPriceAtTick, getTickAtSqrtPrice } from "./liquidity";

const P = 357_406_776_030_000_000_000n; // TSLA 357.40677603 (RedStone, 2026-09-29)
const sqrtP = sqrtFromTokenPrice(P);

describe("house plan (B.3.4)", () => {
  it("seeds 30 tokens: 80 % within ±12 %, 20 % full range, never spending more than it has", () => {
    const mirror = 30_000_000n;
    const ps = planHouse({ sqrtPriceX96: sqrtP, tokenPriceE18: P, mirror, ladderUsd: 0n });
    expect(ps.map((x) => x.label)).toEqual(["concentrated", "full-range"]);
    const [c, f] = ps as [(typeof ps)[0], (typeof ps)[0]];
    expect(Math.abs(c.tickLower % 60)).toBe(0);
    expect(Math.abs(c.tickUpper % 60)).toBe(0);
    const lowUsd = tokenPriceFromSqrt(getSqrtPriceAtTick(c.tickUpper));
    const highUsd = tokenPriceFromSqrt(getSqrtPriceAtTick(c.tickLower));
    expect(Number((lowUsd * 10_000n) / P)).toBeLessThanOrEqual(8_800);
    expect(Number((highUsd * 10_000n) / P)).toBeGreaterThanOrEqual(11_200);
    expect(f).toMatchObject({ tickLower: -887_220, tickUpper: 887_220 });
    const spent1 = c.amount1 + f.amount1;
    const spent0 = c.amount0 + f.amount0;
    expect(spent1 <= mirror + 2n).toBe(true);
    const usd = (mirror * P) / WAD;
    expect(spent0 <= usd + 2n).toBe(true);
    // each position is limited by its scarcer side (LiquidityAmounts takes the min): here pathUSD binds
    expect(spent0 > (usd * 99n) / 100n).toBe(true);
    expect(spent1 > (mirror * 85n) / 100n).toBe(true);
    expect(f.amount1).toBe(6_000_000n); // the full range takes its 20 % exactly
  });

  it("lays a pathUSD-only bid ladder over −1 %…−15 % above the current tick", () => {
    const ps = planHouse({ sqrtPriceX96: sqrtP, tokenPriceE18: P, mirror: 0n, ladderUsd: 20_000_000_000n });
    expect(ps).toHaveLength(7);
    const current = getTickAtSqrtPrice(sqrtP);
    let total = 0n;
    for (const r of ps) {
      expect(r.tickLower).toBeGreaterThan(current);
      expect(r.amount1).toBe(0n);
      total += r.amount0;
    }
    expect(total <= 20_000_000_000n + 7n && total > 19_990_000_000n).toBe(true);
    const top = tokenPriceFromSqrt(getSqrtPriceAtTick(ps[0]!.tickLower));
    const bottom = tokenPriceFromSqrt(getSqrtPriceAtTick(ps[6]!.tickUpper));
    expect(Number((top * 10_000n) / P)).toBeLessThanOrEqual(9_900);
    expect(Number((bottom * 10_000n) / P)).toBeGreaterThanOrEqual(8_500);
  });
});
