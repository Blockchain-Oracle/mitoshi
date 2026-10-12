import { describe, expect, it } from "vitest";
import type { AbiFunction, Address } from "viem";
import { decodeFunctionData, erc20Abi } from "viem";
import { deployments, TEMPO } from "@cwf/clients";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { encodeBridgeIntent } from "../../stocks/encoders";
import { stocksRelayPolicy } from "./stocks";
import { POLICIES } from "./index";

const WALLET = "0x1111111111111111111111111111111111111111" as Address;
const RH = "0x2222222222222222222222222222222222222222" as Address;
const ctx = { chainId: 42431, wallet: WALLET };

describe("stocks relay policy (R4-12)", () => {
  const fns = stocksRelayPolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the adapter really has, and is registered on the deployed adapters", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...stocksRelayPolicy.sponsor, ...stocksRelayPolicy.never]) expect(names.has(n), n).toBe(true);
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    expect(stocksRelayPolicy.targets.map((t) => t.toLowerCase())).toContain(d["42431"]!.stocks!.contracts.AdapterTSLA!.address.toLowerCase());
    expect(POLICIES).toContain(stocksRelayPolicy);
  });

  it("sponsors only the two exits from a deferred credit; never a bridge-out", () => {
    expect([...stocksRelayPolicy.sponsor].sort()).toEqual(["claimDeferred", "sendDeferred"]);
    expect(stocksRelayPolicy.never).toContain("send");
    expect(stocksRelayPolicy.entry).toEqual([]);
  });
});

describe("bridge encoders (R4-12)", () => {
  it("bridges out in one unsponsored transaction with exact approvals", () => {
    const r = encodeBridgeIntent({ kind: "bridge-send", ticker: "TSLA", amountSD: 5_000_000n, recipient: RH, feeBase: 219_679n }, ctx);
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.value.sponsored).toBe(false);
    const [usd, mirror, send] = r.value.calls;
    expect(usd!.to.toLowerCase()).toBe(TEMPO.pathUSD.toLowerCase());
    expect(decodeFunctionData({ abi: erc20Abi, data: usd!.data }).args[1]).toBe(219_679n);
    expect(decodeFunctionData({ abi: erc20Abi, data: mirror!.data }).args[1]).toBe(5_000_000n);
    const decoded = decodeFunctionData({ abi: tIP20MintBurnAdapterAbi, data: send!.data });
    expect(decoded.functionName).toBe("send");
    const [sp, fee, refund] = decoded.args as [{ dstEid: number; amountLD: bigint; composeMsg: string }, { nativeFee: bigint }, string];
    expect(sp.dstEid).toBe(40245);
    expect(sp.amountLD).toBe(5_000_000n);
    expect(sp.composeMsg.slice(2, 66)).toBe((40451).toString(16).padStart(64, "0"));
    expect(fee.nativeFee).toBe(219_679n);
    expect(refund.toLowerCase()).toBe(WALLET);
  });

  it("claims and sends back deferred credit sponsored, refuses a bad recipient and other chains", () => {
    const claim = encodeBridgeIntent({ kind: "bridge-claim-deferred", ticker: "AMD" }, ctx);
    expect(claim?.ok && claim.value.sponsored && claim.value.calls.length === 1).toBe(true);
    const back = encodeBridgeIntent({ kind: "bridge-send-deferred", ticker: "TSLA", amountSD: 1n, recipient: RH, feeBase: 1n }, ctx);
    expect(back?.ok && back.value.sponsored && back.value.calls.length === 2).toBe(true);
    expect(encodeBridgeIntent({ kind: "bridge-send", ticker: "TSLA", amountSD: 1n, recipient: "0x0000000000000000000000000000000000000000", feeBase: 1n }, ctx)?.ok).toBe(false);
    expect(encodeBridgeIntent({ kind: "bridge-claim-deferred", ticker: "TSLA" }, { chainId: 1, wallet: WALLET })?.ok).toBe(false);
    expect(encodeBridgeIntent({ kind: "noop" }, ctx)).toBeNull();
  });
});
