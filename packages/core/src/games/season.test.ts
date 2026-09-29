// Ported from Masayume 68f7a09:packages/core/src/games/season.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PRIZE_SPLIT, isEligible, lastPaidRank, parsePrizeSplit, prizeForRank, prizePoolTotalUnits, seasonRemainingMs, seasonWinners } from "./season";

describe("the season's prize rules", () => {
  it("derives the headline pool from the split, so the two cannot drift", () => {
    expect(prizePoolTotalUnits(DEFAULT_PRIZE_SPLIT)).toBe(40 + 20 + 10 + 5 * 6);
    expect(lastPaidRank(DEFAULT_PRIZE_SPLIT)).toBe(9);
  });

  it("parses the reference's start:end:amount list, and refuses a malformed one loudly", () => {
    expect(parsePrizeSplit("1:1:200,4:10:25")).toEqual([
      { rankStart: 1, rankEnd: 1, amountUnits: 200 },
      { rankStart: 4, rankEnd: 10, amountUnits: 25 },
    ]);
    expect(parsePrizeSplit(undefined)).toBe(DEFAULT_PRIZE_SPLIT);
    expect(parsePrizeSplit("  ")).toBe(DEFAULT_PRIZE_SPLIT);
    expect(() => parsePrizeSplit("1:1")).toThrow(/start:end:amount/);
    expect(() => parsePrizeSplit("1:x:5")).toThrow(/start:end:amount/);
    expect(() => parsePrizeSplit("3:2:5")).toThrow(/ordered/);
    expect(() => parsePrizeSplit("0:1:5")).toThrow(/1-based/);
  });

  it("looks a rank's prize up in the split, and pays nothing past it", () => {
    expect(prizeForRank(DEFAULT_PRIZE_SPLIT, 1)).toBe(40);
    expect(prizeForRank(DEFAULT_PRIZE_SPLIT, 4)).toBe(5);
    expect(prizeForRank(DEFAULT_PRIZE_SPLIT, 9)).toBe(5);
    expect(prizeForRank(DEFAULT_PRIZE_SPLIT, 10)).toBeNull();
  });

  it("skips the ineligible rather than paying them, and walks the split down the eligible list", () => {
    const standings = [
      { wallet: "0xa", rating: 1200, stakedDuels: 0 },
      { wallet: "0xb", rating: 1150, stakedDuels: 3 },
      { wallet: "0xc", rating: 1100, stakedDuels: 1 },
      { wallet: "0xd", rating: 1050, stakedDuels: 2 },
    ];
    const winners = seasonWinners(standings, [{ rankStart: 1, rankEnd: 2, amountUnits: 10 }, { rankStart: 3, rankEnd: 3, amountUnits: 0 }], 1);
    // 0xa sits first on the ladder and is not paid: no staked duel. The split's rank 3 pays nothing, so 0xd is not a winner.
    expect(winners).toEqual([
      { rank: 1, wallet: "0xb", rating: 1150, amountUnits: 10 },
      { rank: 2, wallet: "0xc", rating: 1100, amountUnits: 10 },
    ]);
    expect(isEligible(0, 1)).toBe(false);
    expect(isEligible(1, 1)).toBe(true);
  });

  it("counts down to the end and floors at zero", () => {
    const endsAt = "2026-09-30T23:59:59Z";
    expect(seasonRemainingMs({ endsAt }, Date.parse(endsAt) - 5_000)).toBe(5_000);
    expect(seasonRemainingMs({ endsAt }, Date.parse(endsAt) + 5_000)).toBe(0);
  });
});
