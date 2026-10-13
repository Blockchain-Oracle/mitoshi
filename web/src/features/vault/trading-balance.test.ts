// The one money reading's sums (R4-4, D-227): the Trading Balance counts every live grant's budget (the vault
// invariant), a revoked or absent grant counts nothing, and the figure is wallet + Trading Balance + positions + collect.
import type { VaultGrant, VaultSnapshot } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { sumMoney } from "@/features/markets/portfolio/money-sum";
import { grantBudgetsOf, tradingBalanceOf } from "./trading-balance";

const grant = (budgetBase: bigint, revoked = false) => ({ budgetBase, revoked }) as VaultGrant;
const snap = (availableBase: bigint, grants: Partial<VaultSnapshot["grants"]>): Pick<VaultSnapshot, "account" | "grants"> => ({
  account: { availableBase, privateAvailableBase: 0n, totalDepositedBase: 0n, totalWithdrawnBase: 0n },
  grants: { session: null, executor: null, strategy: null, exit: null, ...grants },
});

describe("tradingBalanceOf", () => {
  it("is free alone with no grant", () => {
    expect(tradingBalanceOf(snap(5_000_000n, {}))).toBe(5_000_000n);
  });
  it("adds every live grant's budget (tap-trading and a strategy)", () => {
    expect(tradingBalanceOf(snap(5_000_000n, { session: grant(2_500_000n), strategy: grant(1_000_000n) }))).toBe(8_500_000n);
    expect(grantBudgetsOf(snap(0n, { session: grant(2_500_000n), strategy: grant(1_000_000n) }))).toBe(3_500_000n);
  });
  it("leaves out a revoked grant (its budget is back in free)", () => {
    expect(tradingBalanceOf(snap(7_500_000n, { session: grant(2_500_000n, true) }))).toBe(7_500_000n);
  });
});

describe("sumMoney", () => {
  it("is wallet + Trading Balance + positions + collect, in base units", () => {
    expect(sumMoney({ walletBase: 10_000_000n, tradingBase: 8_500_000n, positionsBase: 1_234_567n, collectBase: 400_000n })).toBe(20_134_567n);
  });
});
