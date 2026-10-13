import type { VaultGrant } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { budgetCentsOf, budgetStateOf, copyStateOf, copyToneOf } from "./activity";
import { winRateOf } from "./record";

const RUNNER = "0xca7BFA5CBdC7135Ba178ca23cD2B12C123258B9a";
const NOW = 1_791_700_000;
const grant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  grantId: 4n, owner: RUNNER, actor: RUNNER, kind: "strategy", revoked: false, expiresAtSec: NOW + 86_400, spentDay: 0, spentTodayBase: 0n, openPositions: 0,
  caps: { maxStakePerTradeBase: 2_000_000n, maxDailySpendBase: 10_000_000n, maxOpenPositions: 1, maxPriceRaw: 0n, market: null }, budgetBase: 10_000_000n, ...over,
}) as VaultGrant;
const sub = (over = {}) => ({ strategyId: "1", grantId: "4", mode: "follow" as const, active: true, feesPaidBase: "0", subscribedAtSec: NOW - 10, ...over });
const card = { active: true, runner: RUNNER };

describe("the record's win rate", () => {
  it("is wins over decided trades, voids left out", () => {
    expect(winRateOf({ wins: 3, losses: 1 })).toBe(75);
    expect(winRateOf({ wins: 0, losses: 0 })).toBeNull();
  });
});

describe("a copy's state comes from this wallet's consent and grant", () => {
  it("copying, fading, paused, replaced, expired, used up", () => {
    expect(copyStateOf(card, null, null, NOW)).toBe("not-copying");
    expect(copyStateOf(card, sub(), grant(), NOW)).toBe("copying");
    expect(copyStateOf(card, sub({ mode: "fade" }), grant(), NOW)).toBe("fading");
    expect(copyStateOf(card, sub({ active: false }), grant(), NOW)).toBe("paused");
    expect(copyStateOf(card, sub(), grant({ grantId: 9n }), NOW)).toBe("replaced");
    expect(copyStateOf(card, sub(), grant({ expiresAtSec: NOW - 1 }), NOW)).toBe("expired");
    expect(copyStateOf(card, sub(), grant({ budgetBase: 0n }), NOW)).toBe("unfunded");
    // $0.02 left: under one contract at any price the runner would pay — it skips the call ("under the smallest order").
    expect(copyStateOf(card, sub(), grant({ budgetBase: 20_000n }), NOW)).toBe("low");
    // One state for the dot and the top-up under it: never green over a budget warning.
    expect(copyToneOf("low")).toBe("warn");
    expect(copyToneOf("unfunded")).toBe("warn");
    expect(copyToneOf("copying")).toBe("live");
  });

  it("is low only when the budget can't cover one contract at its price cap — the runner sizes a call down to it", () => {
    // $1.50 under a $2 per-trade cap still buys a contract at any price: not low.
    expect(budgetStateOf(grant({ budgetBase: 1_500_000n }))).toBeNull();
    // No price cap: a contract can cost up to $1.
    expect(budgetStateOf(grant({ budgetBase: 990_000n }))).toBe("low");
    // A 70¢ cap: $0.70 covers one; $0.40 covers calls up to 40¢.
    const capped = (budgetBase: bigint) => grant({ budgetBase, caps: { maxStakePerTradeBase: 2_000_000n, maxDailySpendBase: 10_000_000n, maxOpenPositions: 1, maxPriceRaw: 700_000n, market: null } });
    expect(budgetStateOf(capped(700_000n))).toBeNull();
    expect(budgetStateOf(capped(400_000n))).toBe("low");
    expect(budgetCentsOf(capped(400_000n))).toBe(40);
    expect(budgetStateOf(grant({ budgetBase: 0n }))).toBe("unfunded");
  });
});
