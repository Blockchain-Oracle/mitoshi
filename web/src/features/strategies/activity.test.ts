import type { VaultGrant } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { copyStateOf, runnerLabelOf } from "./activity";
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
  });
});

describe("the runner's report, read narrowly", () => {
  it("names what Mitoshi's runner writes, and nothing it doesn't", () => {
    expect(runnerLabelOf("published; waiting for a live subscriber")).toBe("Waiting for a copier");
    expect(runnerLabelOf("2 subscribers, none with a live grant")).toBe("No live budget");
    expect(runnerLabelOf("read 1 of 2 Windows: BTC/5m held; 0 filled — 0x12 skipped: book thin")).toBe("Held in last scan");
    expect(runnerLabelOf("scanned 3 markets; 2 filled — filled UP for 0xabc")).toBe("Filled 2");
    expect(runnerLabelOf("no trading Window on 5m right now; 1 live subscriber")).toBe("Resting");
    expect(runnerLabelOf("confirmation unknown: 0xdead; holding new entries")).toBe("Held · unconfirmed");
    expect(runnerLabelOf("something new")).toBe("Runner report");
  });
});
