import { describe, expect, it } from "vitest";
import { computeBadges, nextBadge } from "./badges";

const ONE = 1_000_000n;
const base = { fillCount: 0, currentWinStreak: 0, stakeBase: 0n, decidedRounds: 0, winRate: 0, decimals: 6, lpSharesRaw: 0n };

describe("badge progress", () => {
  it("counts each badge toward its rule, capped at the need", () => {
    const b = computeBadges({ ...base, fillCount: 7, currentWinStreak: 2, stakeBase: 412n * ONE + 999_999n, decidedRounds: 13, winRate: 0.5 });
    expect(b.map((x) => [x.id, x.progress])).toEqual([
      ["first_trade", { have: 1, need: 1 }],
      ["winning_streak", { have: 2, need: 3 }],
      ["lp_provider", undefined],
      ["whale", { have: 412, need: 1000 }],
      ["oracle", { have: 10, need: 10 }],
    ]);
  });

  it("next is the unearned, connected badge furthest along", () => {
    const b = computeBadges({ ...base, fillCount: 1, currentWinStreak: 2, stakeBase: 100n * ONE, decidedRounds: 3, winRate: 0.66 });
    expect(nextBadge(b)?.id).toBe("winning_streak");
  });

  it("an oracle short only of its win rate is still next when it is furthest along", () => {
    const b = computeBadges({ ...base, fillCount: 1, currentWinStreak: 0, stakeBase: 0n, decidedRounds: 12, winRate: 0.5 });
    expect(nextBadge(b)?.id).toBe("oracle");
  });

  it("skips a pending badge and returns null when everything is earned", () => {
    const all = computeBadges({ fillCount: 1, currentWinStreak: 3, stakeBase: 1_000n * ONE, decidedRounds: 10, winRate: 0.7, decimals: 6, lpSharesRaw: null });
    expect(nextBadge(all)).toBeNull();
  });
});
