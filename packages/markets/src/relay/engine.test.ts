import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, multicall3Abi, type Address } from "viem";
import { Abis } from "viem/tempo";
import { OPEN_POSTURE, postureOf } from "@cwf/core";
import { TEMPO, UTILITIES } from "@cwf/clients";
import { evaluate, feeMicros, normalizeRequest } from "./engine";
import { keysPolicy, noopPolicy } from "./policies";
import type { RelayPolicy, RelayRequest } from "./types";

const FEE_PAYER = "0x00000000000000000000000000000000000000fe" as Address;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const ENGINE = "0x00000000000000000000000000000000000e9e1e" as Address;
const engineAbi = [
  { type: "function", name: "placeOrder", stateMutability: "nonpayable", inputs: [{ name: "x", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdrawCredit", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "sweepSurplus", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
const enginePolicy: RelayPolicy = { area: "engine", targets: [ENGINE], abi: engineAbi, sponsor: ["placeOrder", "withdrawCredit"], never: ["sweepSurplus"], pillar: "markets", entry: ["placeOrder"], maxGas: 2_000_000n };
const config = { chainId: 42431, feePayer: FEE_PAYER, policies: [noopPolicy, keysPolicy, enginePolicy] };
const ctx = { method: "eth_fillTransaction", device: "dev-1", region: OPEN_POSTURE, nowSec: 1_000 };

const noop = { to: UTILITIES.multicall3, data: encodeFunctionData({ abi: multicall3Abi, functionName: "getCurrentBlockTimestamp" }), value: 0n };
const place = { to: ENGINE, data: encodeFunctionData({ abi: engineAbi, functionName: "placeOrder", args: [1n] }), value: 0n };
const approve = (spender: Address, amount: bigint) => ({ to: TEMPO.pathUSD as Address, data: encodeFunctionData({ abi: Abis.tip20, functionName: "approve", args: [spender, amount] }), value: 0n });
const req = (calls: RelayRequest["calls"], over: Partial<RelayRequest> = {}): RelayRequest => ({ chainId: 42431, from: USER, calls, gas: 50_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, ...over });

describe("relay policy engine (C.3.3)", () => {
  it("sponsors the no-op and refuses another Multicall3 selector (S1 gate)", async () => {
    expect(await evaluate(config, req([noop]), ctx)).toMatchObject({ ok: true, area: "noop" });
    const aggregate = { ...noop, data: encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [[]] }) };
    expect(await evaluate(config, req([aggregate]), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("refuses the wrong chain, the fee payer as sender, CREATE, value, too many calls and unknown targets", async () => {
    expect(await evaluate(config, req([noop], { chainId: 4217 }), ctx)).toMatchObject({ code: "chain" });
    expect(await evaluate(config, req([noop], { from: FEE_PAYER }), ctx)).toMatchObject({ code: "self-sponsor" });
    expect(await evaluate(config, req([{ ...noop, to: null }]), ctx)).toMatchObject({ code: "create" });
    expect(await evaluate(config, req([{ ...noop, value: 1n }]), ctx)).toMatchObject({ code: "value" });
    expect(await evaluate(config, req(Array(9).fill(noop)), ctx)).toMatchObject({ code: "too-many-calls" });
    expect(await evaluate(config, req([{ ...noop, to: USER }]), ctx)).toMatchObject({ code: "target" });
  });

  it("allows an exact approve to the area's contract in the same batch, never a max or foreign spender, never alone", async () => {
    expect(await evaluate(config, req([approve(ENGINE, 5_000_000n), place]), ctx)).toMatchObject({ ok: true, area: "engine" });
    expect(await evaluate(config, req([approve(ENGINE, maxUint256), place]), ctx)).toMatchObject({ code: "approve-max" });
    expect(await evaluate(config, req([approve(USER, 1n), place]), ctx)).toMatchObject({ code: "approve-spender" });
    expect(await evaluate(config, req([approve(ENGINE, 1n)]), ctx)).toMatchObject({ code: "target" });
  });

  it("holds entry selectors for a restricted region but keeps exits open (C.3.5)", async () => {
    const us = { ...ctx, region: postureOf("US") };
    expect(await evaluate(config, req([approve(ENGINE, 1n), place]), us)).toMatchObject({ code: "region" });
    const exit = { to: ENGINE, data: encodeFunctionData({ abi: engineAbi, functionName: "withdrawCredit" }), value: 0n };
    expect(await evaluate(config, req([exit]), us)).toMatchObject({ ok: true });
  });

  it("enforces the area gas cap, pathUSD fees and the 300 s expiring window", async () => {
    expect(await evaluate(config, req([noop], { gas: 100_001n }), ctx)).toMatchObject({ code: "gas" });
    expect(await evaluate(config, req([noop], { feeToken: "0x20c0000000000000000000000000000000000001" }), ctx)).toMatchObject({ code: "fee-token" });
    expect(await evaluate(config, req([noop], { validBefore: 1_301 }), ctx)).toMatchObject({ code: "expiry" });
    expect(await evaluate(config, req([noop], { validBefore: null }), ctx)).toMatchObject({ code: "expiry" });
    expect(await evaluate(config, req([noop], { nonceKey: 3n, validBefore: null }), ctx)).toMatchObject({ ok: true });
  });

  it("revokes keys (an exit) but never authorises them through the relay", async () => {
    const revoke = { to: TEMPO.accountKeychain as Address, data: encodeFunctionData({ abi: Abis.accountKeychain, functionName: "revokeKey", args: [USER] }), value: 0n };
    expect(await evaluate(config, req([revoke]), { ...ctx, region: postureOf("US") })).toMatchObject({ ok: true, area: "keys" });
  });

  it("converts attodollar fees to microdollars, rounding up", () => {
    expect(feeMicros({ gas: 50_000n, maxFeePerGas: 20_000_000_000n })).toBe(1_000n);
    expect(feeMicros({ gas: 1n, maxFeePerGas: 1n })).toBe(1n);
    expect(feeMicros({ gas: null, maxFeePerGas: 1n })).toBe(0n);
  });

  it("normalises fill requests (single call or calls[], 'expiring' nonce key)", () => {
    const r = normalizeRequest({ chainId: "0xa5bf", from: USER, to: noop.to, data: noop.data, nonceKey: "expiring", validBefore: 5 }, 1);
    expect(r).toMatchObject({ chainId: 42431, calls: [{ to: noop.to, value: 0n }], nonceKey: maxUint256, validBefore: 5 });
  });
});
