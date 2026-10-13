import { describe, expect, it } from "vitest";
import { decodeFunctionData, keccak256, maxUint256, type Address, type Hex } from "viem";
import { Abis } from "viem/tempo";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { TEMPO } from "@cwf/clients";
import { OPEN_POSTURE, specPayload, type ThemeSpec, type TxIntent } from "@cwf/core";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { encodeThemeIntent, themesVenueOf } from "./encoders";
import { mirrorsOf } from "./reads";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({ chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 400_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });
const enc = (i: TxIntent) => {
  const r = encodeThemeIntent(i, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error(`not encoded: ${r ? r.diagnosis.technical : "unclaimed"}`);
  return r.value;
};

describe("themes intents → the tx lane (S16a, R4-11)", () => {
  it("the five stock mirrors are known and the themes contracts are deployed on Moderato", () => {
    expect(mirrorsOf(CHAIN).map((m) => m.symbol).sort()).toEqual(["AMD", "AMZN", "NFLX", "PLTR", "TSLA"]);
    expect(themesVenueOf(CHAIN)?.registry).toBeTruthy();
    expect(themesVenueOf(4217)).toBeNull();
  });

  it("publish is the creator's own write: specHash = keccak256 of the canonical spec, carried as its data URI", () => {
    const tsla = mirrorsOf(CHAIN).find((m) => m.symbol === "TSLA")!;
    const spec: ThemeSpec = { schema: 1, name: "T", blurb: "", creatorFeeBps: 10, maxSlippageBps: 100, minIntervalSec: 3_600, maxRefAgeSec: 345_600, sessionsMask: 1, bands: [{ token: tsla.token, symbol: "TSLA", minBps: 9_000, targetBps: 10_000, maxBps: 10_000, allowed: true }], cashBand: { minBps: 0, targetBps: 0, maxBps: 1_000 } };
    const e = enc({ kind: "theme-publish", spec, tokens: [tsla.token] });
    expect(e.sponsored).toBe(false);
    const d = decodeFunctionData({ abi: themeRegistryAbi, data: e.calls[0]!.data });
    expect(d.functionName).toBe("publish");
    const p = (d.args as unknown as [{ specHash: Hex; specURI: string }])[0];
    expect(p.specHash).toBe(keccak256(specPayload(spec).bytes));
    expect(p.specURI).toBe(specPayload(spec).uri);
  });

  it("unfollow, caps and the creator's fee claim are sponsored by the themes policy", async () => {
    const caps = { expirySec: 2_000, allocationUsd: 100_000_000n, maxTradeUsd: 20_000_000n, maxDailyUsd: 50_000_000n, maxSlippageBps: 100, maxFeeBps: 50, minIntervalSec: 3_600 };
    for (const i of [{ kind: "theme-unfollow", themeId: 1n }, { kind: "theme-update-caps", themeId: 1n, caps }, { kind: "theme-claim-fees" }] as TxIntent[]) {
      const e = enc(i);
      expect(e.sponsored).toBe(true);
      expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "themes" });
    }
    expect(encodeThemeIntent({ kind: "theme-claim-fees" }, { chainId: 4217, wallet: USER })).toMatchObject({ ok: false, diagnosis: { kind: "not-deployed" } });
  });

  it("follow is one root tx [authorizeKey, follow] the relay now sponsors as its shape; a lone keychain call is refused", async () => {
    const tokens = mirrorsOf(CHAIN).map((m) => m.token);
    const caps = { expirySec: 2_000, allocationUsd: 100_000_000n, maxTradeUsd: 20_000_000n, maxDailyUsd: 50_000_000n, maxSlippageBps: 100, maxFeeBps: 50, minIntervalSec: 3_600 };
    const e = enc({ kind: "theme-follow", themeId: 1n, version: 1, caps, keyId: "0x00000000000000000000000000000000000000b2", tokens, tokenDailyLimits: tokens.map(() => 1_000_000n), pathUsdDailyLimit: 60_000_000n });
    expect(e.calls).toHaveLength(2);
    expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "themes" });
    expect(await evaluate(config, req([e.calls[0]!]), ctx)).toMatchObject({ ok: false, code: "target" });
  });

  it("past five stocks the follow carries every limit and the first scopes; the rest are scopeChunk calls (R4-11)", () => {
    const base = mirrorsOf(CHAIN).map((m) => m.token);
    const tokens = [...base, ...base.map((t) => `0x20c0${"0".repeat(20)}${t.slice(26, 40)}ff` as Address)].slice(0, 7);
    const caps = { expirySec: 2_000, allocationUsd: 100_000_000n, maxTradeUsd: 20_000_000n, maxDailyUsd: 50_000_000n, maxSlippageBps: 100, maxFeeBps: 50, minIntervalSec: 3_600 };
    const key = "0x00000000000000000000000000000000000000b2" as Address;
    const e = enc({ kind: "theme-follow", themeId: 3n, version: 1, caps, keyId: key, tokens, tokenDailyLimits: tokens.map(() => 1_000_000n), pathUsdDailyLimit: 60_000_000n });
    const [, , config] = decodeFunctionData({ abi: Abis.accountKeychain, data: e.calls[0]!.data }).args as unknown as [Address, number, { limits: unknown[]; allowedCalls: unknown[] }];
    expect(config.limits).toHaveLength(8);
    expect(config.allowedCalls).toHaveLength(2 + 5);
    const chunk = enc({ kind: "theme-key-scopes", themeId: 3n, keyId: key, tokens: tokens.slice(5) });
    expect(chunk.sponsored).toBe(true);
    const [k, scopes] = decodeFunctionData({ abi: Abis.accountKeychain, data: chunk.calls[0]!.data }).args as unknown as [Address, unknown[]];
    expect([k.toLowerCase(), scopes.length]).toEqual([key, 2]);
    expect(encodeThemeIntent({ kind: "theme-key-scopes", themeId: 3n, keyId: key, tokens: [...tokens, ...tokens] }, { chainId: CHAIN, wallet: USER })).toMatchObject({ ok: false });
  });

  it("the creator names the ERC-8004 agent with setAgent, self-paid", () => {
    const e = enc({ kind: "theme-set-agent", themeId: 1n, agentId: 9n });
    expect(e.sponsored).toBe(false);
    expect(decodeFunctionData({ abi: themeRegistryAbi, data: e.calls[0]!.data })).toMatchObject({ functionName: "setAgent", args: [1n, 9n] });
  });
});
