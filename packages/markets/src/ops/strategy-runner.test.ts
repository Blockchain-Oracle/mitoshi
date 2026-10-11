import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import type { VaultGrant } from "@cwf/core";
import { runnerOrder, runnerVenueOf, type RunnerWindow } from "./strategy-runner";

const rv = runnerVenueOf(42431)!;
const NOW = 1_791_700_000;
const MARKET = `0x${"ab".repeat(32)}` as Hex;
/** The live BTC-5m grid: 1,000 raw a lot, 1,000 raw a tick, one base unit a tick-lot. */
const window: RunnerWindow = {
  marketId: MARKET, seriesId: `0x${"7c".repeat(32)}`, index: 10n, spotSymbol: "BTC", cadenceSec: 300, tradingStartSec: NOW - 60, lockAtSec: NOW + 240, expirySec: NOW + 240, openPriceE8: 6_000_000_000_000n,
  grid: { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1n, decimals: 6 },
};
/** Asks 600 (YES at 60¢) and bids 380 (NO asks at 62¢), deep enough for any test stake. */
const book = { bids: [[380, 100_000n]] as [number, bigint][], asks: [[600, 100_000n]] as [number, bigint][] };
const grant = (over: Partial<VaultGrant> = {}, caps: Partial<VaultGrant["caps"]> = {}): VaultGrant => ({
  grantId: 8n, owner: "0x1ef9d7ec85393f9b68dca8980d266b574cc2ac18" as Address, actor: "0xca7bfa5cbdc7135ba178ca23cd2b12c123258b9a" as Address, kind: "strategy", revoked: false,
  expiresAtSec: NOW + 86_400, spentDay: 0, spentTodayBase: 0n, openPositions: 0, budgetBase: 10_000_000n,
  caps: { maxStakePerTradeBase: 2_000_000n, maxDailySpendBase: 10_000_000n, maxOpenPositions: 2, maxPriceRaw: 900_000n, market: null, ...caps }, ...over,
});
const order = (g: VaultGrant, side: "up" | "down" = "up", held = { up: 0n, down: 0n }) => runnerOrder(rv, { grant: g, window, side, book, held, nowSec: NOW, nowMs: NOW * 1000 });

describe("runnerOrder (S9.5)", () => {
  it("stakes the per-trade cap and sends one placeFor on the subscriber's grant at the YES-terms limit", () => {
    const o = order(grant());
    if (!o.ok) throw new Error(o.why);
    expect(o.stakeBase).toBe(2_000_000n);
    const { functionName, args } = decodeFunctionData({ abi: eventVaultV2Abi, data: o.call.data });
    expect(o.call.to).toBe(rv.vault);
    expect(functionName).toBe("placeFor");
    const [grantId, marketId, outcomeIdx, isBuy, priceRaw, quantityRaw] = args as unknown as [bigint, Hex, number, boolean, bigint, bigint];
    expect([grantId, marketId, outcomeIdx, isBuy]).toEqual([8n, MARKET, 0, true]);
    expect(priceRaw).toBeGreaterThanOrEqual(600_000n);
    expect(quantityRaw * priceRaw / 1_000_000n).toBeLessThanOrEqual(2_000_000n);
  });

  it("a DOWN order buys NO (outcome 1) — the side a fade turns a call into", () => {
    const o = order(grant(), "down");
    if (!o.ok) throw new Error(o.why);
    expect((decodeFunctionData({ abi: eventVaultV2Abi, data: o.call.data }).args as unknown as unknown[])[2]).toBe(1);
  });

  it("sizes at the smallest of the per-trade cap, today's headroom and the budget", () => {
    const today = Math.floor(NOW / 86_400);
    const tight = order(grant({ spentDay: today, spentTodayBase: 9_000_000n }));
    expect(tight.ok && tight.stakeBase).toBe(1_000_000n);
    const poor = order(grant({ budgetBase: 500_000n }));
    expect(poor.ok && poor.stakeBase).toBe(500_000n);
    expect(order(grant({ spentDay: today, spentTodayBase: 10_000_000n }))).toEqual({ ok: false, why: "no headroom today" });
  });

  it("leaves a subscriber already in the Window alone, and names a grant refusal instead of sending it", () => {
    expect(order(grant(), "up", { up: 1n, down: 0n })).toEqual({ ok: false, why: "already in this Window" });
    expect(order(grant({}, { maxPriceRaw: 550_000n }))).toEqual({ ok: false, why: "the grant refuses it (price)" });
    expect(order(grant({ revoked: true }))).toEqual({ ok: false, why: "the grant refuses it (revoked)" });
  });

  it("holds inside the no-entry buffer before lock", () => {
    const late = runnerOrder(rv, { grant: grant(), window: { ...window, lockAtSec: NOW + 20 }, side: "up", book, held: { up: 0n, down: 0n }, nowSec: NOW, nowMs: NOW * 1000 });
    expect(late).toEqual({ ok: false, why: "inside the no-entry buffer before lock" });
  });
});
