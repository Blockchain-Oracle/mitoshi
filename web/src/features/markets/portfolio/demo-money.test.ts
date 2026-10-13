import { describe, expect, it } from "vitest";
import { demoMoney } from "./demo-money";

const START = 10_000_000_000n;

describe("demoMoney", () => {
  it("a fresh DEMO reads its whole balance, nothing open, ready", () => {
    const d = demoMoney({ balanceBase: START, history: [] }, [], new Map());
    expect(d.money.totalBase).toBe(START);
    expect(d.freeBase).toBe(START);
    expect(d.openBase).toBe(0n);
    expect(d.money.openCount).toBe(0);
    expect(d.money.ready).toBe(true);
    expect(d.settledCount).toBe(0);
  });

  it("an open $5 call: the figure is the balance plus unrealised P&L", () => {
    const rows = [{ id: "p:1", costBase: 5_000_000n }];
    const d = demoMoney({ balanceBase: START, history: [] }, rows, new Map([["p:1", { equityBase: 6_250_000n }]]));
    expect(d.freeBase).toBe(START - 5_000_000n);
    expect(d.openBase).toBe(6_250_000n);
    expect(d.money.totalBase).toBe(START + 1_250_000n);
    expect(d.money.ready).toBe(true);
  });

  it("a row with no value yet counts at cost and the card is not ready", () => {
    const rows = [{ id: "p:1", costBase: 5_000_000n }, { id: "p:2", costBase: 2_000_000n }];
    const d = demoMoney({ balanceBase: START, history: [] }, rows, new Map([["p:1", { equityBase: 4_000_000n }]]));
    expect(d.openBase).toBe(4_000_000n + 2_000_000n);
    expect(d.money.totalBase).toBe(START - 1_000_000n);
    expect(d.money.ready).toBe(false);
  });

  it("realised P&L sums the paper history (signed), the balance already holds it", () => {
    const history = [{ pnlBase: "1500000" }, { pnlBase: "-400000" }];
    const d = demoMoney({ balanceBase: START + 1_100_000n, history }, [], new Map());
    expect(d.realisedBase).toBe(1_100_000n);
    expect(d.money.totalBase).toBe(START + 1_100_000n);
    expect(d.settledCount).toBe(2);
  });
});
