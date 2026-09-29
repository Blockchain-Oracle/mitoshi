import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, type AbiFunction, type Address, type Hex } from "viem";
import { Abis } from "viem/tempo";
import { OPEN_POSTURE } from "@cwf/core";
import { deployments, TEMPO } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { evaluate } from "../engine";
import type { RelayKeyAuthorization } from "../key-auth";
import type { RelayRequest } from "../types";
import { walletKeyAuthorization } from "../../keys/wallet-key";
import { normalizeKeyAuthorization } from "../key-auth";
import { enginePolicy, WALLET_KEY_AUTH_GAS } from "./engine";
import { POLICIES } from ".";

const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: Address }> }>>;
const ENGINE = d["42431"]!.engine!.contracts.EventsEngine!.address;
const LENS = d["42431"]!.engine!.contracts.EngineLens!.address;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const M = `0x${"ab".repeat(32)}` as Hex;
const PATH = TEMPO.pathUSD as Address;
const config = { chainId: 42431, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000_000 };

const call = (functionName: string, args: readonly unknown[], to: Address = ENGINE) => ({ to, data: encodeFunctionData({ abi: eventsEngineAbi, functionName: functionName as never, args: args as never }), value: 0n });
const place = call("placeOrder", [{ marketId: M, kind: 0, orderType: 2, selfMatch: 0, priceTicks: 600, lots: 4_000n, expireTs: 1_000_030, maxFills: 16, maxEvictions: 16, useCredit: false, withdrawProceeds: false, clientId: 1n }]);
const approve = (spender: Address, amount: bigint) => ({ to: PATH, data: encodeFunctionData({ abi: Abis.tip20, functionName: "approve", args: [spender, amount] }), value: 0n });
const req = (calls: RelayRequest["calls"], over: Partial<RelayRequest> = {}): RelayRequest => ({
  chainId: 42431, from: USER, calls, gas: 400_000n, maxFeePerGas: 2_000_000_000n, feeToken: PATH, nonceKey: maxUint256, validBefore: ctx.nowSec + 25, keyAuthorization: null, ...over,
});
const walletKey = (): RelayKeyAuthorization => normalizeKeyAuthorization({ address: "0x00000000000000000000000000000000000000c3", ...walletKeyAuthorization({ engine: ENGINE, pathUsd: PATH, nowSec: ctx.nowSec }) })!;

describe("engine relay policy (D-135), registered", () => {
  it("is in POLICIES and names only functions the engine has (no drift from the generated ABI)", () => {
    expect(POLICIES).toContain(enginePolicy);
    const names = new Set((eventsEngineAbi as readonly { type: string }[]).filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...enginePolicy.sponsor, ...enginePolicy.never, ...enginePolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("targets only EventsEngine (never the lens, verifiers or libraries)", () => {
    expect(enginePolicy.targets.map((t) => t.toLowerCase())).toEqual([ENGINE.toLowerCase()]);
  });

  it("sponsors the wallet order [approve(engine, exact), placeOrder] and every exit", async () => {
    expect(await evaluate(config, req([approve(ENGINE, 2_400_000n), place]), ctx)).toMatchObject({ ok: true, area: "engine" });
    for (const exit of [call("redeem", [M]), call("withdrawCredit", [M, 5n]), call("cancelOrders", [M, [1n], true]), call("cancelAll", [M, 16, true]), call("redeemPartial", [M, 0, 1n])]) {
      expect(await evaluate(config, req([exit]), ctx)).toMatchObject({ ok: true });
    }
  });

  it("refuses another selector: the admin/roller surface refuses the whole tx, a keeper call is not sponsored", async () => {
    expect(await evaluate(config, req([call("setMode", [1])]), ctx)).toMatchObject({ ok: false, code: "never" });
    expect(await evaluate(config, req([place, call("openWindow", [{ seriesId: M, index: 1n, "tradingStart": 1, lockAt: 2, "expiry": 2, openKind: 0, closeKind: 0 }])]), ctx)).toMatchObject({ ok: false, code: "never" });
    expect(await evaluate(config, req([call("redeemFor", [M, USER])]), ctx)).toMatchObject({ ok: false, code: "selector" });
    expect(await evaluate(config, req([call("settle", [M])]), ctx)).toMatchObject({ ok: false, code: "selector" });
  });

  it("never sponsors capital intake: mintSet refuses the transaction even beside a sponsored call", async () => {
    expect(await evaluate(config, req([call("mintSet", [M, 1_000n, false])]), ctx)).toMatchObject({ ok: false, code: "never" });
    expect(await evaluate(config, req([approve(ENGINE, 1_000_000n), call("mintSet", [M, 1_000n, false]), place]), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("refuses approvals to anyone but the engine, unlimited approvals, and approvals alone", async () => {
    expect(await evaluate(config, req([approve(LENS, 1n), place]), ctx)).toMatchObject({ ok: false, code: "approve-spender" });
    expect(await evaluate(config, req([approve(ENGINE, maxUint256), place]), ctx)).toMatchObject({ ok: false, code: "approve-max" });
    expect(await evaluate(config, req([approve(ENGINE, 1n)]), ctx)).toMatchObject({ ok: false, code: "target" });
  });

  it("geofences placeOrder (the entry) but keeps exits open in a restricted region", async () => {
    const restricted = { ...ctx, region: { ...OPEN_POSTURE, markets: "restricted" as const } };
    expect(await evaluate(config, req([approve(ENGINE, 1n), place]), restricted)).toMatchObject({ ok: false, code: "region" });
    expect(await evaluate(config, req([call("redeem", [M])]), restricted)).toMatchObject({ ok: true });
  });

  it("caps gas at 3M, plus the measured allowance only for a tap that publishes the wallet key (D-136)", async () => {
    expect(await evaluate(config, req([approve(ENGINE, 1n), place], { gas: 3_000_001n }), ctx)).toMatchObject({ ok: false, code: "gas" });
    const first = req([approve(ENGINE, 2_400_000n), place], { gas: 7_100_000n, keyAuthorization: walletKey() });
    expect(await evaluate(config, first, ctx)).toMatchObject({ ok: true });
    expect(await evaluate(config, { ...first, gas: 3_000_000n + WALLET_KEY_AUTH_GAS + 1n }, ctx)).toMatchObject({ ok: false, code: "gas" });
  });

  it("refuses to publish any key wider than wallet mode", async () => {
    const tap = (k: RelayKeyAuthorization) => evaluate(config, req([approve(ENGINE, 1n), place], { gas: 7_000_000n, keyAuthorization: k }), ctx);
    const k = walletKey();
    expect(await tap({ ...k, scopes: null })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, isAdmin: true })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, expirySec: null })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, expirySec: ctx.nowSec + 30 * 86_400 })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, limits: [{ ...k.limits[0]!, limit: 26_000_000n }] })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, limits: [{ ...k.limits[0]!, periodSec: 0 }] })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, scopes: [...k.scopes!, { target: PATH, selector: "0xa9059cbb", recipients: [] }] })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, scopes: [{ target: PATH, selector: "0x095ea7b3", recipients: [USER] }] })).toMatchObject({ code: "key-auth" });
    expect(await tap({ ...k, scopes: [{ target: ENGINE, selector: "0x00000000", recipients: [] }] })).toMatchObject({ code: "key-auth" });
    // Another area never pays to publish a key at all.
    const noop = POLICIES.find((p) => p.area === "keys")!;
    expect(await evaluate(config, req([{ to: noop.targets[0]!, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: "revokeKey", args: [USER] }), value: 0n }], { keyAuthorization: k }), ctx)).toMatchObject({ code: "key-auth" });
  });
});
