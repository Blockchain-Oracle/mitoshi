import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { toMarketId, type EventMarket, type MarketId } from "@cwf/core";
import { claimAllInputOf, claimablesOf, planClaimAll, type ClaimSource } from "./claims";

const ENGINE = "0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a" as Address;
const id = (n: number): MarketId => toMarketId(`0x${n.toString(16).padStart(64, "0")}`);
const decoded = (data: `0x${string}`) => decodeFunctionData({ abi: eventsEngineAbi, data });

const market = (n: number, state: EventMarket["state"], winningOutcome: 0 | 1 | null): ClaimSource["market"] => ({
  marketId: id(n), asset: "BTC", intervalSec: 300, expirySec: 1_000 + n, decimals: 6, state, winningOutcome, resolvedAtMs: null,
});
const pos = (p: Partial<ClaimSource["position"]> = {}): ClaimSource["position"] => ({ credit: 0n, yesFree: 0n, noFree: 0n, yesLocked: 0n, noLocked: 0n, ...p });

describe("claim-all batching (D-048)", () => {
  it("redeems every settled Window, withdraws standalone credits, and chunks at 8 calls per transaction", () => {
    const plan = planClaimAll({ engine: ENGINE, redeem: Array.from({ length: 6 }, (_, i) => id(i + 1)), credits: [3, 4, 5, 10].map((n) => ({ marketId: id(n + 10), amountBase: BigInt(n) })) });
    expect(plan.batches.map((b) => b.length)).toEqual([8, 2]);
    expect(plan.batches.flat().map((c) => decoded(c.data).functionName)).toEqual([...Array(6).fill("redeem"), ...Array(4).fill("withdrawCredit")]);
    expect(decoded(plan.batches[1]![1]!.data).args).toEqual([id(20), 10n]);
    expect(plan.batches.flat().every((c) => c.to === ENGINE)).toBe(true);
  });

  it("collapses duplicates, drops zero credits, and never withdraws a credit its Window's redeem already pays", () => {
    const plan = planClaimAll({ engine: ENGINE, redeem: [id(1), id(1)], credits: [{ marketId: id(1), amountBase: 5n }, { marketId: id(2), amountBase: 0n }, { marketId: id(3), amountBase: 7n }, { marketId: id(3), amountBase: 9n }] });
    expect(plan.redeemed).toEqual([id(1)]);
    expect(plan.withdrawn).toEqual([id(3)]);
    expect(decoded(plan.batches[0]![1]!.data).args).toEqual([id(3), 9n]);
    expect(planClaimAll({ engine: ENGINE, redeem: [], credits: [] }).batches).toEqual([]);
  });
});

describe("claimable rows from lens positions", () => {
  const sources: ClaimSource[] = [
    { market: market(1, "resolved", 0), lotBase: 1000n, position: pos({ yesFree: 3_000n }) }, // win
    { market: market(2, "resolved", 0), lotBase: 1000n, position: pos({ noFree: 2_000n }) }, // loss: no row
    { market: market(3, "voided", null), lotBase: 1000n, position: pos({ yesFree: 1_000n, noLocked: 1_000n }) }, // void: both legs at ½
    { market: market(4, "open", null), lotBase: 1000n, position: pos({ credit: 42n }) }, // refund credit on a live Window
    { market: market(5, "resolved", 1), lotBase: 1000n, position: pos({ credit: 500n }) }, // payout held as credit (position rewritten)
    { market: market(6, "resolved", 1), lotBase: 1000n, position: pos({ yesFree: 1_000n, credit: 9n }) }, // a loser that still has credit
  ];

  it("a win pays its side, a void both sides at half, a losing side is never a row, credit is its own row", () => {
    const rows = claimablesOf(sources, true);
    const by = new Map(rows.map((r) => [r.marketId, r]));
    expect(by.get(id(1))).toMatchObject({ kind: "win", netPayoutBase: 3_000_000n, heldByReceivePolicy: false });
    expect(by.has(id(2))).toBe(false);
    expect(by.get(id(3))).toMatchObject({ kind: "void", netPayoutBase: 1_000_000n });
    expect(by.get(id(3))!.legs).toHaveLength(2);
    expect(by.get(id(4))).toMatchObject({ kind: "credit", netPayoutBase: 42n });
    expect(by.get(id(5))).toMatchObject({ kind: "credit", netPayoutBase: 500n });
    expect(by.get(id(6))).toMatchObject({ kind: "credit", netPayoutBase: 9n });
  });

  it("claim-all redeems wins and voids and withdraws credits; a receive-policy hold leaves every row out", () => {
    const input = claimAllInputOf(ENGINE, claimablesOf(sources, true));
    expect(new Set(input.redeem)).toEqual(new Set([id(1), id(3)]));
    expect(new Map(input.credits.map((c) => [c.marketId, c.amountBase]))).toEqual(new Map([[id(4), 42n], [id(5), 500n], [id(6), 9n]]));
    const held = claimablesOf(sources, false);
    expect(held.every((r) => r.heldByReceivePolicy)).toBe(true);
    expect(claimAllInputOf(ENGINE, held)).toEqual({ engine: ENGINE, redeem: [], credits: [] });
  });
});
