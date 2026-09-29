import { describe, expect, it } from "vitest";
import { decodeFunctionData, maxUint256, type Address, type Hex } from "viem";
import { Abis } from "viem/tempo";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { cashOutCall, kindOf, ORDER_TYPE, walletOrderCalls, yesTicksOf } from "./calls";

const ENGINE = "0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a" as Address;
const PATH = "0x20C0000000000000000000000000000000000000" as Address;
const M = `0x${"ab".repeat(32)}` as Hex;
const place = (data: Hex) => (decodeFunctionData({ abi: eventsEngineAbi, data }).args![0] as Record<string, unknown>);
const base = { engine: ENGINE, collateral: PATH, marketId: M, lots: 4_000n, maxCostBase: 2_400_000n, creditBase: 0n, expireTsSec: 1_000, clientId: 7n };

describe("order lane encoding (C.2.3 row 1)", () => {
  it("an Up tap is [pathUSD.approve(engine, exact maxCost), placeOrder(BUY_YES, IOC)] at the own-terms limit", () => {
    const calls = walletOrderCalls({ ...base, side: "up", ownLimitTicks: 600 });
    expect(calls.map((c) => c.to)).toEqual([PATH, ENGINE]);
    const approve = decodeFunctionData({ abi: Abis.tip20, data: calls[0]!.data });
    expect(approve).toMatchObject({ functionName: "approve", args: [ENGINE, 2_400_000n] });
    expect(approve.args![1]).not.toBe(maxUint256);
    expect(place(calls[1]!.data)).toMatchObject({ marketId: M, kind: 0, orderType: ORDER_TYPE.ioc, priceTicks: 600, lots: 4_000n, expireTs: 1_000, useCredit: false, withdrawProceeds: false, clientId: 7n, maxFills: 16 });
  });

  it("a Down tap buys NO with its limit sent in YES terms (1000 − own)", () => {
    const calls = walletOrderCalls({ ...base, side: "down", ownLimitTicks: 350 });
    expect(place(calls[1]!.data)).toMatchObject({ kind: 2, priceTicks: 650 });
  });

  it("draws engine credit first: approves only the rest, and none when credit covers the escrow", () => {
    const partial = walletOrderCalls({ ...base, side: "up", ownLimitTicks: 600, creditBase: 400_000n });
    expect(decodeFunctionData({ abi: Abis.tip20, data: partial[0]!.data }).args![1]).toBe(2_000_000n);
    expect(place(partial[1]!.data)).toMatchObject({ useCredit: true });
    const covered = walletOrderCalls({ ...base, side: "up", ownLimitTicks: 600, creditBase: 3_000_000n });
    expect(covered).toHaveLength(1);
    expect(covered[0]!.to).toBe(ENGINE);
  });

  it("a pre-open call on a Listed Window is PostOnly, never a taker", () => {
    expect(place(walletOrderCalls({ ...base, side: "up", ownLimitTicks: 500, preOpen: true })[1]!.data)).toMatchObject({ orderType: ORDER_TYPE.postOnly });
  });

  it("cash-out sells the held side IOC and withdraws the proceeds in the same call", () => {
    expect(place(cashOutCall(ENGINE, { marketId: M, side: "up", ownLimitTicks: 420, lots: 3_000n, expireTsSec: 900, clientId: 1n }).data)).toMatchObject({ kind: 1, orderType: ORDER_TYPE.ioc, priceTicks: 420, withdrawProceeds: true, useCredit: false });
    expect(place(cashOutCall(ENGINE, { marketId: M, side: "down", ownLimitTicks: 420, lots: 3_000n, expireTsSec: 900, clientId: 1n }).data)).toMatchObject({ kind: 3, priceTicks: 580 });
  });

  it("kinds and the YES-terms price map both sides and refuse off-grid prices", () => {
    expect([kindOf("up", "buy"), kindOf("up", "sell"), kindOf("down", "buy"), kindOf("down", "sell")]).toEqual([0, 1, 2, 3]);
    expect(yesTicksOf("down", 1)).toBe(999);
    expect(() => yesTicksOf("up", 0)).toThrow();
    expect(() => yesTicksOf("up", 1000)).toThrow();
  });
});
