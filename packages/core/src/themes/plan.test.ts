import { describe, expect, it } from "vitest";
import { pathUsdDailyLimit, planRebalance, themeDrift, tokenDailyLimit, type DriftMember } from "./plan";

const USD = (n: number) => BigInt(n) * 1_000_000n;
const P = (n: number) => BigInt(n) * 10n ** 18n;
const PATH = "0x20C0000000000000000000000000000000000000";

describe("theme drift and plan (S16a, R4-11)", () => {
  it("the key's daily limits: ceil(daily / price × 1.2) per token, the daily plus the fee in pathUSD", () => {
    expect(tokenDailyLimit(USD(50), P(250))).toBe(240_000n); // 0.24 of a $250 stock
    expect(tokenDailyLimit(USD(50), null)).toBe(0n);
    expect(pathUsdDailyLimit(USD(50), 25)).toBe(51_125_000n); // + $1 of network-fee headroom
  });

  it("weights read over the allocation, and an out-of-band token is planned back to its target within the caps", () => {
    const band = { minBps: 4_300, targetBps: 5_000, maxBps: 5_700, allowed: true };
    const members: DriftMember[] = [
      { token: "0xA", balance: 0n, priceE18: P(100), band },
      { token: "0xB", balance: 800_000n, priceE18: P(100), band }, // $80
    ];
    const drift = themeDrift(members, USD(500), USD(100)); // only $20 of cash counts inside the $100 allocation
    expect(drift.totalUsd).toBe(USD(100));
    expect(drift.rows.map((r) => [r.weightBps, r.out])).toEqual([[0, "under"], [8_000, "over"]]);
    const legs = planRebalance(members, drift, { pathUsd: PATH, maxTradeUsd: USD(40), maxSlippageBps: 100 });
    expect(legs).toEqual([
      { tokenIn: "0xB", tokenOut: PATH, amountIn: 300_000n, minAmountOut: 29_700_000n },
      { tokenIn: PATH, tokenOut: "0xA", amountIn: USD(40), minAmountOut: 396_000n },
    ]);
  });

  it("the legs together stay inside what the follow's day has left", () => {
    const band = { minBps: 3_000, targetBps: 3_333, maxBps: 3_700, allowed: true };
    const m: DriftMember[] = ["0xA", "0xB", "0xC"].map((token) => ({ token, balance: 0n, priceE18: P(10), band }));
    const legs = planRebalance(m, themeDrift(m, USD(100), USD(100)), { pathUsd: PATH, maxTradeUsd: USD(20), maxSlippageBps: 100, dailyLeftUsd: USD(50) });
    expect(legs.map((l) => l.amountIn)).toEqual([USD(20), USD(20), USD(10)]);
  });

  it("nothing is planned while a member has no reference price", () => {
    const band = { minBps: 0, targetBps: 10_000, maxBps: 10_000, allowed: true };
    const m: DriftMember[] = [{ token: "0xA", balance: 0n, priceE18: null, band }];
    expect(planRebalance(m, themeDrift(m, USD(10), USD(10)), { pathUsd: PATH, maxTradeUsd: USD(10), maxSlippageBps: 100 })).toEqual([]);
  });
});
