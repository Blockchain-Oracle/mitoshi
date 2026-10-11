import { describe, expect, it } from "vitest";
import type { VaultGrant } from "@cwf/core";
import { COPY_TERM_SEC, capsWithin, planCopy, stopIntent, type CopyPlanInput } from "./copy-plan";
import type { StrategyWire } from "./protocol";

const RUNNER = "0xca7bfa5cbdc7135ba178ca23cd2b12c123258b9a";
const OTHER = "0x00000000000000000000000000000000000000b2";
const NOW = 1_791_700_000;
const ONE = 1_000_000n;
const strategy = (id: string, over: Partial<StrategyWire["envelope"]> = {}, runner = RUNNER, feeBase = "0"): StrategyWire => ({
  strategyId: id, creator: RUNNER, runner, agentId: "7", name: `S${id}`, description: "", spec: null, specText: null,
  envelope: { maxStakePerTradeBase: "5000000", maxDailySpendBase: "50000000", maxOpenPositions: 3, maxPriceRaw: "900000", series: null, seriesLabel: null, ...over },
  feeBase, active: true, subscribers: 0, createdAtSec: 0, revision: 0,
  record: { fills: 0, settled: 0, wins: 0, losses: 0, voids: 0, netBase: "0", stakedBase: "0", curve: [], lastActiveSec: 0, distinctSubscribers: 0, open: 0, copyTrades: 0, entrustedBase: "0" },
  health: { kind: "alive", lastTickMs: null, intervalMs: null, why: null }, agent: null, feedback: { count: 0, mean: null }, memory: null,
});
const grant = (over: Partial<VaultGrant> = {}, caps: Partial<VaultGrant["caps"]> = {}): VaultGrant => ({
  grantId: 8n, owner: "0x1ef9d7ec85393f9b68dca8980d266b574cc2ac18", actor: RUNNER, kind: "strategy", revoked: false, expiresAtSec: NOW + 86_400, spentDay: 0, spentTodayBase: 0n,
  openPositions: 0, budgetBase: 10n * ONE, caps: { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 10n * ONE, maxOpenPositions: 2, maxPriceRaw: 900_000n, market: null, ...caps }, ...over,
});
const s1 = strategy("1");
const s2 = strategy("2", { maxStakePerTradeBase: "3000000", maxDailySpendBase: "20000000", maxOpenPositions: 2, maxPriceRaw: "800000" });
const base = (over: Partial<CopyPlanInput> = {}): CopyPlanInput => ({
  strategy: s1, strategies: [s1, s2], mine: [], grant: null, availableBase: 0n, walletBase: 100n * ONE, mode: "follow", choice: "new", budgetText: "10", perTradeText: "2", nowSec: NOW, busy: false, signedIn: true, ...over,
});

describe("planCopy (one transaction, D-219)", () => {
  it("a first copy deposits what the Trading Balance lacks and grants the runner a budget inside the envelope", () => {
    const p = planCopy(base({ availableBase: 4n * ONE }));
    expect(p.route).toBe("new");
    expect(p.depositBase).toBe(6n * ONE);
    expect(p.blockedBy).toBeNull();
    expect(p.intent).toMatchObject({ kind: "strategy-copy", strategyId: 1n, budgetBase: 10n * ONE, depositBase: 6n * ONE, expiresAtSec: NOW + COPY_TERM_SEC, carry: [], caps: { maxStakePerTradeBase: 2n * ONE, maxDailySpendBase: 50n * ONE, maxOpenPositions: 3, maxPriceRaw: 900_000n } });
  });

  it("shares a live grant to the same runner whose caps fit — nothing moves", () => {
    const p = planCopy(base({ strategy: s1, grant: grant(), mine: [{ strategyId: "2", grantId: "8", mode: "follow", active: true, feesPaidBase: "0", subscribedAtSec: 0 }], choice: "share" }));
    expect(p.route).toBe("share");
    expect(p.shareBlocked).toBeNull();
    expect(p.intent).toEqual({ kind: "strategy-subscribe", strategyId: 1n, grantId: 0n, mode: "follow", maxFeeBase: 0n });
    // The same grant is wider than strategy 2's 80¢ price cap: it can't be shared there.
    expect(planCopy(base({ strategy: s2, grant: grant(), choice: "share" })).shareBlocked).toBe("Your live copy budget's limits are wider than this strategy allows.");
  });

  it("won't share a grant whose caps are wider than this envelope; a new budget carries the other copy and fits both envelopes", () => {
    const wide = grant({}, { maxStakePerTradeBase: 4n * ONE });
    const mine = [{ strategyId: "1", grantId: "8", mode: "fade" as const, active: true, feesPaidBase: "0", subscribedAtSec: 0 }];
    const p = planCopy(base({ strategy: s2, grant: wide, mine, choice: "share", budgetText: "10", perTradeText: "3" }));
    expect(p.shareBlocked).toBe("Your live copy budget's limits are wider than this strategy allows.");
    expect(p.route).toBe("new");
    expect(p.carried).toEqual([{ strategyId: "1", name: "S1", mode: "fade" }]);
    // The old grant's $10 returns first, so no deposit is needed.
    expect(p.depositBase).toBe(0n);
    expect(p.caps).toEqual({ maxStakePerTradeBase: 3n * ONE, maxDailySpendBase: 20n * ONE, maxOpenPositions: 2, maxPriceRaw: 800_000n, market: null });
    expect(p.intent).toMatchObject({ kind: "strategy-copy", carry: [{ strategyId: 1n, mode: "fade" }] });
  });

  it("names the copies a new budget stops when the live grant is for another runner", () => {
    const theirs = strategy("9", {}, OTHER);
    const p = planCopy(base({ strategies: [s1, s2, theirs], grant: grant({ actor: OTHER }), mine: [{ strategyId: "9", grantId: "8", mode: "follow", active: true, feesPaidBase: "0", subscribedAtSec: 0 }] }));
    expect(p.shareBlocked).toBe("Your live copy budget is for another runner.");
    expect(p.stops).toEqual(["S9"]);
    expect(p.carried).toEqual([]);
  });

  it("says the first reason it can't be sent, in the order a person fixes them", () => {
    expect(planCopy(base({ signedIn: false })).blockedBy).toBe("Sign in to copy");
    expect(planCopy(base({ walletBase: null })).blockedBy).toBe("Checking your balances…");
    expect(planCopy(base({ budgetText: "" })).blockedBy).toBe("Enter a budget");
    expect(planCopy(base({ perTradeText: "6" })).blockedBy).toBe("This strategy allows at most $5.00 a trade.");
    expect(planCopy(base({ perTradeText: "12" })).perTradeError).toBe("This strategy allows at most $5.00 a trade.");
    expect(planCopy(base({ budgetText: "1", perTradeText: "2" })).blockedBy).toBe("Can't be more than the budget.");
    expect(planCopy(base({ walletBase: 5n * ONE })).blockedBy).toBe("Your wallet has $5.00; this needs $10.00.");
    expect(planCopy(base({ budgetText: "1e3" })).blockedBy).toBe("Enter an amount like 10 or 2.50.");
    expect(planCopy(base({ strategy: { ...s1, active: false } })).blockedBy).toBe("This strategy is closed to new copiers");
  });

  it("caps the fee by what the creator asks now, from the wallet", () => {
    const paid = strategy("4", {}, RUNNER, "1500000");
    const p = planCopy(base({ strategy: paid, strategies: [paid], walletBase: 11n * ONE }));
    expect(p.blockedBy).toBe("Your wallet has $11.00; this needs $11.50.");
    expect(planCopy(base({ strategy: paid, strategies: [paid] })).intent).toMatchObject({ maxFeeBase: 1_500_000n });
  });
});

describe("capsWithin", () => {
  it("takes the tightest of every envelope; a price cap of 0 (none) never loosens another", () => {
    expect(capsWithin([s1.envelope, { ...s2.envelope, maxPriceRaw: "0" }], 2n * ONE).maxPriceRaw).toBe(900_000n);
    expect(capsWithin([{ ...s1.envelope, maxPriceRaw: "0" }], 2n * ONE).maxPriceRaw).toBe(0n);
  });
});

describe("stopIntent", () => {
  const g = grant();
  it("revokes and unsubscribes the last copy on a grant; only unsubscribes while another copy shares it", () => {
    const one = [{ strategyId: "1", grantId: "8", mode: "follow" as const, active: true, feesPaidBase: "0", subscribedAtSec: 0 }];
    expect(stopIntent("1", one, g)).toEqual({ kind: "strategy-stop", strategyId: 1n, grantId: 8n });
    const two = [...one, { strategyId: "2", grantId: "8", mode: "fade" as const, active: true, feesPaidBase: "0", subscribedAtSec: 0 }];
    expect(stopIntent("1", two, g)).toEqual({ kind: "strategy-unsubscribe", strategyId: 1n });
    expect(stopIntent("1", one, null)).toEqual({ kind: "strategy-unsubscribe", strategyId: 1n });
  });
});
