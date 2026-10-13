import type { VaultGrant } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { budgetLow, copyStateOf } from "./activity";
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
    // $0.02 left against a $2 call: the runner skips it every time ("under the smallest order") — not "Copying".
    expect(copyStateOf(card, sub(), grant({ budgetBase: 20_000n }), NOW)).toBe("low");
    expect(budgetLow(grant({ budgetBase: 2_000_000n }))).toBe(false);
  });
});
