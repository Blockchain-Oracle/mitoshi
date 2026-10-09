import { describe, expect, it } from "vitest";
import { pnlInRange, rangeRoiBps } from "./pnl-range";

const H = 3_600_000;
const NOW = 1_000 * H;
const round = (hoursAgo: number, pnl: bigint, stake = 1_000_000n) => ({ settledAtMs: NOW - hoursAgo * H, expirySec: 0, pnlBase: pnl, stakeBase: stake });

describe("pnlInRange", () => {
  const rounds = [round(2, 500_000n), round(30, -250_000n), round(24 * 10, 2_000_000n), round(24 * 40, -1_000_000n)];

  it("counts only the rounds inside each range", () => {
    expect(pnlInRange(rounds, "24H", NOW)).toMatchObject({ realizedBase: 500_000n, stakedBase: 1_000_000n, count: 1 });
    expect(pnlInRange(rounds, "7D", NOW)).toMatchObject({ realizedBase: 250_000n, count: 2 });
    expect(pnlInRange(rounds, "30D", NOW)).toMatchObject({ realizedBase: 2_250_000n, count: 3 });
    expect(pnlInRange(rounds, "All", NOW)).toMatchObject({ realizedBase: 1_250_000n, stakedBase: 4_000_000n, count: 4 });
  });

  it("samples the cumulative curve from zero to the range's total, never ahead of a round", () => {
    const { curve } = pnlInRange(rounds, "7D", NOW, 64);
    expect(curve).toHaveLength(64);
    expect(curve[0]).toBe(0n);
    expect(curve.at(-1)).toBe(250_000n);
    // The −0.25 lands 30 h ago and the +0.5 2 h ago: the curve dips below zero before it ends above.
    expect(curve.some((v) => v === -250_000n)).toBe(true);
  });

  it("starts All at the first round and is flat zero with none", () => {
    expect(pnlInRange(rounds, "All", NOW, 8).curve[0]).toBe(-1_000_000n);
    const empty = pnlInRange([], "All", NOW, 8);
    expect(empty).toMatchObject({ realizedBase: 0n, count: 0 });
    expect(empty.curve.every((v) => v === 0n)).toBe(true);
  });

  it("falls back to the expiry when a round has no settle time", () => {
    const r = { settledAtMs: null, expirySec: (NOW - H) / 1000, pnlBase: 7n, stakeBase: 1n };
    expect(pnlInRange([r], "24H", NOW).realizedBase).toBe(7n);
  });
});

describe("rangeRoiBps", () => {
  it("divides by the range's stake plus what is open", () => {
    expect(rangeRoiBps(250_000n, 2_000_000n, 500_000n)).toBe(1_000);
    expect(rangeRoiBps(-1n, 0n, 0n)).toBeNull();
  });
});
