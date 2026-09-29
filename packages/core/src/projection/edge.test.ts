// Ported from Masayume 68f7a09:packages/core/src/projection/edge.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { computeBadges } from "./badges";
import { roundsToCsv } from "./csv";
import { computeTraderEdge } from "./edge";
import { equityCurve, maxDrawdownBase, winStreaks } from "./equity";
import { rankTraders } from "./leaderboard";
import { computeTier, reputationOf } from "./reputation";
import type { SettledRound } from "./types";

const ONE = 1_000_000n;
const HOUR = 3_600_000;

const round = (i: number, pnl: bigint, outcome: SettledRound["outcome"], stake = 5n * ONE): SettledRound => ({
  marketId: toMarketId(`0x${i.toString(16).padStart(64, "0")}`), asset: "BTC", intervalSec: 300, expirySec: i * 3_600, decimals: 6,
  outcome, legs: outcome === "closed" ? [] : [{ outcomeIdx: 0, amountRaw: stake * 2n, payoutBase: outcome === "win" ? stake * 2n : 0n }], sidesTraded: [0],
  stakeBase: stake, proceedsBase: 0n, payoutBase: outcome === "win" ? stake * 2n : 0n, feeBase: 0n, pnlBase: pnl, feeBps: 0, claim: "paid", source: "wallet",
  settledAtMs: i * HOUR, openedAtMs: i * HOUR - 60_000, entryTxHash: "0x1", fillCount: 1, shortCount: 0,
});

const SERIES = [round(1, 5n * ONE, "win"), round(2, -5n * ONE, "loss"), round(3, -5n * ONE, "loss"), round(4, 5n * ONE, "win"), round(5, 5n * ONE, "win"), round(6, 0n, "void")];

describe("equity", () => {
  it("steps one point per round from a zero seed, and measures the deepest slide from the running peak", () => {
    const curve = equityCurve(SERIES);
    expect(curve.map((p) => p.cumulativeBase)).toEqual([0n, 5n * ONE, 0n, -5n * ONE, 0n, 5n * ONE, 5n * ONE]);
    expect(maxDrawdownBase(curve)).toBe(10n * ONE);
    expect(winStreaks(SERIES)).toEqual({ best: 2, current: 2 });
  });
});

describe("computeTraderEdge", () => {
  it("reports ratios over decided rounds and money in base units", () => {
    const edge = computeTraderEdge(SERIES, 2, (atMs) => new Date(atMs).getUTCHours());
    expect(edge.settledRounds).toBe(6);
    expect(edge.openRounds).toBe(2);
    expect(edge.wins).toBe(3);
    expect(edge.losses).toBe(2);
    expect(edge.voids).toBe(1);
    expect(edge.netBase).toBe(5n * ONE);
    expect(edge.stakeBase).toBe(30n * ONE);
    expect(edge.winRatePct).toBe(60);
    expect(edge.profitFactor).toBe(1.5);
    expect(edge.expectancyBase).toBe(833_333n);
    expect(edge.averageWinBase).toBe(5n * ONE);
    expect(edge.averageLossBase).toBe(5n * ONE);
    expect(edge.maxDrawdownBase).toBe(10n * ONE);
    expect(edge.bestWinStreak).toBe(2);
    expect(edge.windows.find((w) => w.key === "late-night")?.count).toBe(5);
    expect(edge.readout.kind).toBe("best-window");
  });

  it("asks for more rounds below the pattern floor and leaves ratios unset with nothing settled", () => {
    expect(computeTraderEdge(SERIES.slice(0, 2), 0).readout).toEqual({ kind: "more-rounds", needed: 3 });
    const empty = computeTraderEdge([], 1);
    expect(empty.roiPct).toBeNull();
    expect(empty.winRatePct).toBeNull();
    expect(empty.expectancyBase).toBeNull();
    expect(empty.equity).toHaveLength(1);
  });
});

describe("rankTraders", () => {
  it("ranks by net over rounds closed inside the window; a loss never leaves the sum", () => {
    const a = "0xaaaa" as const;
    const b = "0xbbbb" as const;
    const byWallet = new Map([
      [a, [round(1, 5n * ONE, "win"), round(2, -5n * ONE, "loss"), round(9, 50n * ONE, "win")]],
      [b, [round(2, 3n * ONE, "win"), round(3, 0n, "void")]],
    ]);
    const { rankings, closedCalls, totalWallets } = rankTraders(byWallet, { windowStartMs: 0, windowEndMs: 5 * HOUR });
    expect(rankings.map((r) => r.owner)).toEqual([b, a]);
    expect(rankings[1]?.pnlBase).toBe(0n);
    expect(rankings[1]?.winRatePct).toBe(50);
    expect(rankings[0]?.settledTrades).toBe(1);
    expect(rankings[0]?.roiBps).toBe(3_000);
    expect(closedCalls).toBe(4);
    expect(totalWallets).toBe(2);
  });
});

describe("reputation and badges", () => {
  it("applies the reference's tier floors and reports progress to the next", () => {
    expect(computeTier(0, 0)).toBe("Novice");
    expect(computeTier(5, 3)).toBe("Trader");
    expect(computeTier(30, 20)).toBe("Oracle");
    const rep = reputationOf(10, 5, 2);
    expect(rep.tier).toBe("Trader");
    expect(rep.nextTier).toBe("Whale");
    expect(rep.progressToNext).toBe(79);
    expect(reputationOf(40, 30, 0).progressToNext).toBe(100);
  });

  it("locks the LP badge with its dependency named where no maker vault is deployed", () => {
    const badges = computeBadges({ fillCount: 3, currentWinStreak: 3, stakeBase: 1_000n * ONE, decidedRounds: 10, winRate: 0.7, decimals: 6, lpSharesRaw: null });
    expect(badges.map((b) => [b.id, b.earned])).toEqual([["first_trade", true], ["winning_streak", true], ["lp_provider", false], ["whale", true], ["oracle", true]]);
    expect(badges[2]?.pending).toBe("earn");
  });

  it("earns the LP badge on a live share balance, as the reference's plpBalance > 0", () => {
    const base = { fillCount: 0, currentWinStreak: 0, stakeBase: 0n, decidedRounds: 0, winRate: 0, decimals: 6 };
    expect(computeBadges({ ...base, lpSharesRaw: 0n })[2]).toEqual({ id: "lp_provider", earned: false, pending: null });
    expect(computeBadges({ ...base, lpSharesRaw: 1n })[2]).toEqual({ id: "lp_provider", earned: true, pending: null });
  });
});

describe("roundsToCsv", () => {
  it("writes one row per round with full-precision figures", () => {
    const csv = roundsToCsv([round(1, 5n * ONE, "win")]).split("\n");
    expect(csv).toHaveLength(2);
    expect(csv[1]).toContain(",BTC,5m,UP,");
    expect(csv[1]).toContain(",5.00,0.00,10.00,5.00,win,paid,0x1");
  });
});
