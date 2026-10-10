import { describe, expect, it } from "vitest";
import { scoreWeek, seasonWeek, standing } from "./season";

const USD = 1_000_000n;
const week = seasonWeek(Date.UTC(2026, 9, 10, 12) / 1000); // Saturday 2026-10-10

describe("the season week", () => {
  it("runs Monday 00:00 UTC to the next Monday", () => {
    expect(new Date(week.startSec * 1000).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(week.endSec - week.startSec).toBe(7 * 86_400);
    expect(seasonWeek(week.startSec)).toEqual(week);
    expect(seasonWeek(week.startSec - 1).endSec).toBe(week.startSec);
  });
});

describe("a week's points", () => {
  const at = (day: number, hour: number) => week.startSec + day * 86_400 + hour * 3_600;
  it("counts calls, wins, the best run, active days and capped volume — only inside the week", () => {
    const rounds = [
      { atSec: at(0, 1), pnlBase: 2n * USD, stakeBase: 5n * USD },
      { atSec: at(0, 2), pnlBase: 1n * USD, stakeBase: 5n * USD },
      { atSec: at(0, 3), pnlBase: 0n, stakeBase: 5n * USD }, // a void: breaks nothing, wins nothing
      { atSec: at(0, 4), pnlBase: 3n * USD, stakeBase: 5n * USD },
      { atSec: at(2, 9), pnlBase: -1n * USD, stakeBase: 10_000n * USD },
      { atSec: week.startSec - 10, pnlBase: 9n * USD, stakeBase: 5n * USD }, // last week
    ];
    const s = scoreWeek(rounds, week, 6);
    expect(Object.fromEntries(s.categories.map((c) => [c.key, c.points]))).toEqual({ calls: 50, wins: 15, streak: 9, days: 10, volume: 100 });
    expect(s.points).toBe(184);
  });
  it("is nothing with nothing settled", () => {
    expect(scoreWeek([], week, 6)).toEqual({ points: 0, categories: [] });
  });
});

describe("standing", () => {
  const everyone = Array.from({ length: 200 }, (_, i) => i + 1); // 1..200 points
  it("ranks against the week's wallets and names the league", () => {
    expect(standing(200, everyone)).toMatchObject({ rank: 1, of: 200, topPercent: 0.5, tier: "diamond" });
    expect(standing(195, everyone)).toMatchObject({ rank: 6, tier: "platinum" });
    expect(standing(150, everyone)).toMatchObject({ rank: 51, tier: "silver" });
    expect(standing(10, everyone)).toMatchObject({ rank: 191, tier: "bronze" });
  });
  it("leaves a wallet with no points unranked", () => {
    expect(standing(0, everyone)).toEqual({ rank: null, of: 200, topPercent: null, tier: null });
  });
});
