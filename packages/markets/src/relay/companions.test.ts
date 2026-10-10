import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, type Address } from "viem";
import { OPEN_POSTURE } from "@cwf/core";
import { deployments, TEMPO } from "@cwf/clients";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { evaluate } from "./engine";
import { POLICIES } from "./policies";
import type { RelayRequest } from "./types";

type Fragment = { contracts: Record<string, { address: Address }> };
const moderato = deployments["42431"] as unknown as Record<string, Fragment>;
const VAULT = moderato.vault2!.contracts.EventVaultV2!.address;
const REGISTRY = moderato.strategies!.contracts.StrategyRegistry!.address;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const config = { chainId: 42431, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "dev-1", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: RelayRequest["calls"], gas = 400_000n): RelayRequest => ({ chainId: 42431, from: USER, calls, gas, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });
const onVault = (functionName: "revoke" | "withdraw" | "grant", args: readonly unknown[]) => ({ to: VAULT, data: encodeFunctionData({ abi: eventVaultV2Abi, functionName, args: args as never }), value: 0n });
const onRegistry = (functionName: "unsubscribe" | "subscribe", args: readonly unknown[]) => ({ to: REGISTRY, data: encodeFunctionData({ abi: strategyRegistryAbi, functionName, args: args as never }), value: 0n });
const caps = { maxStakePerTrade: 1n, maxDailySpend: 1n, maxOpenPositions: 1, maxPriceRaw: 0n, market: `0x${"0".repeat(64)}` as const };

describe("relay companions (stop = revoke + unsubscribe, D-218.2)", () => {
  it("sponsors the vault's revoke riding in the registry's unsubscribe, either order, as one strategies transaction", async () => {
    expect(await evaluate(config, req([onVault("revoke", [7n]), onRegistry("unsubscribe", [1n])]), ctx)).toMatchObject({ ok: true, area: "strategies" });
    expect(await evaluate(config, req([onRegistry("unsubscribe", [1n]), onVault("revoke", [7n])]), ctx)).toMatchObject({ ok: true, area: "strategies" });
  });

  it("lets only the named vault function ride: a withdraw beside an unsubscribe is one area too many", async () => {
    expect(await evaluate(config, req([onVault("withdraw", [1n]), onRegistry("unsubscribe", [1n])]), ctx)).toMatchObject({ ok: false, code: "target" });
  });

  it("never lifts a call's own policy: a grant (never sponsored) can't ride, nor a subscribe lead it", async () => {
    expect(await evaluate(config, req([onVault("grant", [2, USER, caps, 1n, 1n]), onRegistry("unsubscribe", [1n])]), ctx)).toMatchObject({ ok: false, code: "never" });
    expect(await evaluate(config, req([onVault("revoke", [7n]), onRegistry("subscribe", [1n, 0n, 0, 0n])]), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("adds the companion's gas to the lead's cap, and no more", async () => {
    expect(await evaluate(config, req([onVault("revoke", [7n]), onRegistry("unsubscribe", [1n])], 600_000n), ctx)).toMatchObject({ ok: true });
    expect(await evaluate(config, req([onVault("revoke", [7n]), onRegistry("unsubscribe", [1n])], 600_001n), ctx)).toMatchObject({ ok: false, code: "gas" });
    expect(await evaluate(config, req([onRegistry("unsubscribe", [1n])], 300_001n), ctx)).toMatchObject({ ok: false, code: "gas" });
  });
});
