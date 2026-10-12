// D-227's money rules, every example worked by hand in dollars (6 decimals: 1_000_000n = $1).
import { describe, expect, it } from "vitest";
import { avgTicksOf, boostPayoutBase, boostWorth, combinedSpotFor, costShareOf, paperClose, paysMultiple, positionValueBase, settledPayoutBase, settledWorth, walkTicksOf, walkWorth } from "./position-value";
import { roiBpsOf, totalsOf, type Valued } from "./positions-totals";

const $ = (dollars: number) => BigInt(Math.round(dollars * 1e6));

describe("a position's worth on the exit walk", () => {
  it("after a Reduce: 5 left at $2.50 open cost, the walk pays $3.50 → +$1.00, +40 % (not −$1.50 on a gross $5)", () => {
    const w = walkWorth({ valueBase: $(3.5), contractsRaw: $(5), heldRaw: $(5), costBase: $(2.5) });
    expect(w).toMatchObject({ pnlBase: $(1), costShareBase: $(2.5), roiCostBase: $(2.5), equityBase: $(3.5), triggerValueBase: $(3.5), fillablePct: 100 });
    expect(roiBpsOf(w.pnlBase, w.roiCostBase)).toBe(4_000);
    expect(walkTicksOf($(3.5), $(5))).toBe(700);
  });

  it("on a thin book: 10 held at $5, the book takes 3 for $1.80 → P&L on those 3 (+$0.30), equity $1.80 + $3.50", () => {
    const w = walkWorth({ valueBase: $(1.8), contractsRaw: $(3), heldRaw: $(10), costBase: $(5) });
    expect(w).toMatchObject({ pnlBase: $(0.3), costShareBase: $(1.5), equityBase: $(5.3), triggerValueBase: $(6), fillablePct: 30 });
    // Now is the walk's own price (60¢), not $1.80 over all 10 (18¢).
    expect(walkTicksOf($(1.8), $(3))).toBe(600);
  });

  it("values locked or bid-less contracts at cost, and a settled Window at its payout", () => {
    expect(positionValueBase($(5), $(10), 0n, null)).toBe($(5));
    expect(positionValueBase($(5), $(10), $(10), $(6.2))).toBe($(6.2));
    expect(settledPayoutBase("up", $(10), "resolved", 0)).toBe($(10));
    expect(settledPayoutBase("down", $(10), "resolved", 0)).toBe(0n);
    expect(settledPayoutBase("down", $(10), "voided", null)).toBe($(5));
    expect(settledWorth({ payoutBase: $(10), costBase: $(4), roiCostBase: $(4) })).toMatchObject({ pnlBase: $(6), equityBase: $(10), triggerValueBase: null });
    expect(costShareOf($(5), $(10), $(10))).toBe($(5));
    expect(costShareOf($(5), 0n, $(10))).toBe(0n);
  });
});

describe("a Boost's worth (D-227)", () => {
  // $1 staked at 5×: 10 contracts at 50¢, $4 fronted by the reserve.
  const boost = { heldRaw: $(10), frontedBase: $(4), costBase: $(1), stakeBase: $(1) };

  it("Close pays the mark less the front; P&L against the open cost; ROI on the stake", () => {
    const w = boostWorth({ ...boost, markBase: $(5.5), filledRaw: $(10) });
    expect(w).toMatchObject({ valueBase: $(1.5), pnlBase: $(0.5), roiCostBase: $(1), equityBase: $(1.5), triggerValueBase: $(1.5), fillablePct: 100 });
  });

  it("on a thin book compares like with like: 4 of 10 fill for $2.20 → $2.20 − $1.60 front − $0.40 cost = +$0.20", () => {
    const w = boostWorth({ ...boost, markBase: $(2.2), filledRaw: $(4) });
    // Close pays the owner max(0, 2.20 − 4.00) = 0 now — but that is size, not a loss of the whole stake.
    expect(w).toMatchObject({ valueBase: 0n, pnlBase: $(0.2), costShareBase: $(0.4), roiCostBase: $(0.4), fillablePct: 40 });
    // Equity: the filled part's $0.60 for the owner plus the rest at cost ($0.60).
    expect(w.equityBase).toBe($(1.2));
    // Trigger: $2.20 on 4 is $5.50 on 10, less the $4 front → $1.50.
    expect(w.triggerValueBase).toBe($(1.5));
  });

  it("never loses more than what is in, and pays (held − fronted) ÷ stake: 6×, not 10×", () => {
    expect(boostWorth({ ...boost, markBase: $(3), filledRaw: $(10) })).toMatchObject({ valueBase: 0n, pnlBase: -$(1) });
    expect(paysMultiple({ ...boost, boost: { frontedBase: $(4) } })).toBe(6);
    expect(paysMultiple({ heldRaw: $(10), costBase: $(5) })).toBe(2);
    expect(avgTicksOf({ heldRaw: $(10), costBase: $(1), boost: { entryPriceRaw: 500_000n } })).toBe(500);
    expect(avgTicksOf({ heldRaw: $(5), costBase: $(2.5) })).toBe(500);
  });

  it("pays at settlement what the contracts fetch less the front: won 10 − 4, void 5 − 4, lost 0", () => {
    expect(boostPayoutBase("up", $(10), $(4), "resolved", 0)).toBe($(6));
    expect(boostPayoutBase("up", $(10), $(4), "voided", null)).toBe($(1));
    expect(boostPayoutBase("up", $(10), $(6), "voided", null)).toBe(0n);
    expect(boostPayoutBase("up", $(10), $(4), "resolved", 1)).toBe(0n);
  });
});

describe("DEMO's Close, as live", () => {
  it("sells what the walk fills and keeps the rest at the rest of the cost: 10 at $5, 6 fill for $3.60", () => {
    expect(paperClose({ heldRaw: $(10), costBase: $(5) }, { contractsRaw: $(6), proceedsBase: $(3.6) })).toEqual({ costShareBase: $(3), pnlBase: $(0.6), keep: { contractsRaw: $(4), costBase: $(2) } });
    expect(paperClose({ heldRaw: $(10), costBase: $(5) }, { contractsRaw: $(10), proceedsBase: $(4) })).toEqual({ costShareBase: $(5), pnlBase: -$(1) });
  });
});

describe("the totals (Owarine `totalsOf`)", () => {
  const row = (id: string, costBase: bigint, realizedBase = 0n, realizedCostBase = 0n) => ({ id, costBase, realizedBase, realizedCostBase });
  it("sums P&L and cost over priced rows only, counts the rest, and puts every row in equity", () => {
    const values = new Map<string, Valued>([
      ["a", { status: "priced", pnlBase: $(1), roiCostBase: $(2.5), equityBase: $(3.5) }],
      ["b", { status: "partial", pnlBase: $(0.3), roiCostBase: $(1.5), equityBase: $(5.3) }],
      ["c", { status: "locked", pnlBase: null, roiCostBase: null, equityBase: $(4) }],
      ["d", { status: "settled", pnlBase: -$(2), roiCostBase: $(2), equityBase: 0n }],
    ]);
    const t = totalsOf([row("a", $(2.5), $(1), $(2.5)), row("b", $(5)), row("c", $(4)), row("d", $(2)), row("e", $(1.25))], values);
    // Priced: +1 + 0.3 − 2 = −$0.70 on 2.5 + 1.5 + 2 = $6.00 → −11.66 %. Unpriced: c (locked) and e (not read yet).
    // "a" sold half for +$1.00 on the $2.50 that half cost.
    expect(t).toEqual({ pnlBase: -$(0.7), costBase: $(6), unpriced: 2, equityBase: $(3.5 + 5.3 + 4 + 0 + 1.25), realizedBase: $(1), realizedCostBase: $(2.5) });
    expect(roiBpsOf(t.pnlBase, t.costBase)).toBe(-1_166);
    expect(totalsOf([row("c", $(4))], values).pnlBase).toBeNull();
  });
});

describe("the Window's combined break-even", () => {
  it("finds the spot where every position on the Window pays back their open cost together", () => {
    // Two linear stand-ins: $5 + Δ/10 and $2.50 + Δ/20 for Δ above 62,000; $7.50 + 0.15 Δ = $9 at Δ = 10 → 62,010.
    const a = (s: number) => $(5 + (s - 62_000) / 10);
    const b = (s: number) => $(2.5 + (s - 62_000) / 20);
    const be = combinedSpotFor([a, b], $(9), 62_000, "up")!;
    expect(be).toBeCloseTo(62_010, 1);
    expect(combinedSpotFor([a, () => null], $(9), 62_000, "up")).toBeNull();
    expect(combinedSpotFor([], $(9), 62_000, "up")).toBeNull();
  });
});
