import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi, keccak256, maxUint256, toBytes, type Address } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { OPEN_POSTURE, type BasketSpec, type StrategyIntent, type StrategyMetadata, type TxIntent } from "@cwf/core";
import basketVectors from "@cwf/core/strategies/basket.vectors.json";
import { TEMPO } from "@cwf/clients";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import { BASKET_AGENT_PATH, basketAgentRegistration } from "./basket-agent";
import { encodeStrategyIntent } from "./encoders";
import { strategyVenueOf } from "./deployment";

const ctx = { chainId: 42431, wallet: "0x00000000000000000000000000000000000000a1" as Address };
const venue = strategyVenueOf(42431)!;
const RUNNER = "0x00000000000000000000000000000000000000b2" as Address;
const SPEC = { preset: "momentum", lookback: 6, thresholdBps: 20 } as const;
const META: StrategyMetadata = { name: "BTC momentum", description: "Rides the move", spec: SPEC };
const CAPS = { maxStakePerTradeBase: 2_000_000n, maxDailySpendBase: 10_000_000n, maxOpenPositions: 1, maxPriceRaw: 0n, market: null };

const encode = (intent: StrategyIntent) => {
  const r = encodeStrategyIntent(intent as TxIntent, ctx);
  if (!r?.ok) throw new Error(`refused: ${r ? r.diagnosis.technical : "unclaimed"}`);
  return r.value;
};
const decodeAt = (calls: { to: Address; data: `0x${string}` }[]) =>
  calls.map((c) => {
    const abi = c.to === venue.strategyRegistry ? strategyRegistryAbi : c.to === venue.vault ? eventVaultAbi : erc20Abi;
    return { to: c.to, ...decodeFunctionData({ abi: abi as never, data: c.data }) } as { to: Address; functionName: string; args: readonly unknown[] };
  });
const relay = (calls: { to: Address; data: `0x${string}` }[]) =>
  evaluate(
    { chainId: 42431, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES },
    { chainId: 42431, from: ctx.wallet, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 500_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null },
    { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 },
  );

describe("strategy encoders (S9.3)", () => {
  it("knows the deployed registry and the vault it reads", () => {
    expect(venue.strategyRegistry).toBe("0x79156a899BC8CB773D8b70ecD0392C78eE9FB8FD");
    expect(venue.vault).toBe("0xdbb3Fa8667351Df47f54b1d8ea9B44B28b9C2040");
    expect(venue.maxMetadataBytes).toBe(8_192);
  });

  it("publishes the spec's hash, the metadata as UTF-8 bytes with the intent's spec, the series scope and agent id", () => {
    const v = encode({ kind: "strategy-publish", runner: RUNNER, spec: SPEC, metadata: { ...META, spec: { ...SPEC, lookback: 3 } }, envelope: { ...CAPS, series: `0x${"7c".repeat(32)}` }, feeBase: 1_000_000n, agentId: 6n });
    expect(v.sponsored).toBe(false);
    const [publish] = decodeAt(v.calls);
    expect(publish!.functionName).toBe("publish");
    const [runner, specHash, metadata, envelope, fee, agentId] = publish!.args as [Address, string, `0x${string}`, { market: string }, bigint, bigint];
    expect(runner).toBe(RUNNER);
    expect(specHash).toBe(keccak256(toBytes('{"p":"momentum","lb":6,"th":20}')));
    expect(JSON.parse(Buffer.from(metadata.slice(2), "hex").toString("utf8")).spec).toEqual(SPEC);
    expect(envelope.market).toBe(`0x${"7c".repeat(32)}`);
    expect([fee, agentId]).toEqual([1_000_000n, 6n]);
  });

  it.each(basketVectors.themes)("publishes theme $name with the vectors' spec hash, any Window, and agent #82 (D-231)", (t) => {
    const spec = t.spec as BasketSpec;
    const v = encode({ kind: "strategy-publish", runner: RUNNER, spec, metadata: { name: t.name, description: "", spec }, envelope: { ...CAPS, series: null }, feeBase: 0n, agentId: 82n });
    const [, specHash, metadata, envelope, , agentId] = decodeAt(v.calls)[0]!.args as [Address, string, `0x${string}`, { market: string }, bigint, bigint];
    expect(specHash).toBe(t.specHash);
    expect(JSON.parse(Buffer.from(metadata.slice(2), "hex").toString("utf8")).spec).toEqual(spec);
    expect(envelope.market).toBe(`0x${"00".repeat(32)}`);
    expect(agentId).toBe(82n);
  });

  it("keeps agent #82's registration file at its on-chain agentURI path, describing the basket runner (D-231)", () => {
    const file = basketAgentRegistration("https://mitoshi.xyz", 42431);
    expect(BASKET_AGENT_PATH).toBe("/api/themes/agent/registration.json");
    expect(file).toMatchObject({ active: true, registrations: [{ agentId: 82 }], services: [{ name: "web", endpoint: "https://mitoshi.xyz/themes" }] });
    expect(file.description).toMatch(/basket/i);
    expect(file.description).not.toMatch(/rebalanc|band|mirror/i);
    expect(basketAgentRegistration("https://mitoshi.xyz", 4217).active).toBe(false);
  });

  it("refuses metadata over the registry's 8 KB before anything is signed", () => {
    const r = encodeStrategyIntent({ kind: "strategy-publish", runner: RUNNER, spec: SPEC, metadata: { ...META, playbook: "x".repeat(9_000) }, envelope: { ...CAPS, series: null }, feeBase: 0n, agentId: null }, ctx);
    expect(r).toMatchObject({ ok: false, diagnosis: { errorName: "MetadataTooLarge" } });
  });

  it("copies in ONE self-paid transaction: deposit+grant, the exact fee approval, subscribe on grant 0", async () => {
    const v = encode({ kind: "strategy-copy", strategyId: 3n, runner: RUNNER, caps: CAPS, expiresAtSec: 2_000_000_000, budgetBase: 10_000_000n, depositBase: 10_000_000n, mode: "fade", maxFeeBase: 1_000_000n });
    expect(v).toMatchObject({ area: "strategies", sponsored: false });
    const calls = decodeAt(v.calls);
    expect(calls.map((c) => c.functionName)).toEqual(["approve", "depositAndGrant", "approve", "subscribe"]);
    expect(calls[0]!.args).toEqual([venue.vault, 10_000_000n]);
    expect(calls[1]!.args.slice(0, 3)).toEqual([10_000_000n, 2, RUNNER]);
    expect(calls[2]!.args).toEqual([venue.strategyRegistry, 1_000_000n]);
    expect(calls[3]!.args).toEqual([3n, 0n, 1, 1_000_000n]);
    // The relay never pays for it: the grant and the subscribe are both on `never` lists.
    expect(await relay(v.calls)).toMatchObject({ ok: false, code: "never" });
  });

  it("resumes without a deposit or a fee: grant then subscribe", () => {
    const v = encode({ kind: "strategy-copy", strategyId: 3n, runner: RUNNER, caps: CAPS, expiresAtSec: 2_000_000_000, budgetBase: 5_000_000n, depositBase: 0n, mode: "follow", maxFeeBase: 0n });
    expect(decodeAt(v.calls).map((c) => c.functionName)).toEqual(["grant", "subscribe"]);
  });

  it("a new budget carries the wallet's other copies onto the new grant in the same transaction, no fee for them", () => {
    const v = encode({ kind: "strategy-copy", strategyId: 3n, runner: RUNNER, caps: CAPS, expiresAtSec: 2_000_000_000, budgetBase: 5_000_000n, depositBase: 0n, mode: "follow", maxFeeBase: 0n, carry: [{ strategyId: 1n, mode: "fade" }, { strategyId: 3n, mode: "follow" }] });
    const calls = decodeAt(v.calls);
    expect(calls.map((c) => c.functionName)).toEqual(["grant", "subscribe", "subscribe"]);
    expect(calls[2]!.args).toEqual([1n, 0n, 1, 0n]);
  });

  it("stops in ONE sponsored transaction the relay accepts (revoke + unsubscribe); pause is the revoke alone", async () => {
    const stop = encode({ kind: "strategy-stop", strategyId: 3n, grantId: 9n });
    expect(stop).toMatchObject({ area: "strategies", sponsored: true });
    expect(decodeAt(stop.calls).map((c) => c.functionName)).toEqual(["revoke", "unsubscribe"]);
    expect(await relay(stop.calls)).toMatchObject({ ok: true, area: "strategies" });

    const pause = encode({ kind: "strategy-pause", strategyId: 3n, grantId: 9n });
    expect(pause).toMatchObject({ area: "vault2", sponsored: true });
    expect(await relay(pause.calls)).toMatchObject({ ok: true, area: "vault2" });

    // Paused already (no live grant): stop is the unsubscribe alone.
    expect(decodeAt(encode({ kind: "strategy-stop", strategyId: 3n, grantId: 0n }).calls).map((c) => c.functionName)).toEqual(["unsubscribe"]);
  });

  it("leaves every other intent to the other encoders", () => {
    expect(encodeStrategyIntent({ kind: "noop" }, ctx)).toBeNull();
  });
});
