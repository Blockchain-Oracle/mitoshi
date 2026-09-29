import { decodeFunctionData, getAddress } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { describe, expect, it } from "vitest";
import { APPROVE_SELECTOR, REBALANCE_SELECTOR, themeKeyAuthorization, themeKeyAuthorizeCall, themeKeyScopes, themeKeySetAllowedCallsChunks } from "./keyAuth";

const router = getAddress("0xc9123C1D460BCb20ce6C856f9EC6eE431D1D4007");
const tokens = ["0x20c000000000000000000000a81E861906820FB7", "0x20c00000000000000000000086081D645cF16774"].map((t) => getAddress(t));
const keyId = getAddress("0x2649Caa831196ea0AeC79588790D31C55020B206");
const p = { keyId, router, tokens, expirySec: 1_800_000_000, pathUsdDailyLimit: 1_050_000_000n, tokenDailyLimits: [5_000_000n, 7_000_000n] };

describe("theme key authorization (B.4.3)", () => {
  it("rebalance selector is the ThemeRouter's", () => {
    expect(REBALANCE_SELECTOR).toBe("0x78b1d0cf"); // X4Probe.rebalance / ThemeRouter.rebalance, from forge
  });

  it("authorizeKey call decodes to the exact restrictions: enforced daily limits, scoped, no transfer selector", () => {
    const call = themeKeyAuthorizeCall(p);
    expect(call.to).toBe(getAddress(Addresses.accountKeychain));
    // The decoded KeyRestrictions tuple (named fields: expiry, enforceLimits, limits, allowAnyCalls, allowedCalls).
    type Restrictions = Record<string, unknown> & { enforceLimits: boolean; limits: { token: string; amount: bigint; period: bigint }[]; allowAnyCalls: boolean; allowedCalls: { target: string; selectorRules: { selector: string; recipients: string[] }[] }[] };
    const { functionName, args } = decodeFunctionData({ abi: Abis.accountKeychain, data: call.data }) as unknown as { functionName: string; args: [string, number, Restrictions] };
    expect(functionName).toBe("authorizeKey");
    const [id, sigType, r] = args;
    expect(id).toBe(keyId);
    expect(sigType).toBe(0);
    expect(r["expiry"]).toBe(1_800_000_000n);
    expect(r.enforceLimits).toBe(true);
    expect(r.allowAnyCalls).toBe(false);
    expect(r.limits).toEqual([
      { token: getAddress(Addresses.pathUsd), amount: 1_050_000_000n, period: 86_400n },
      { token: tokens[0], amount: 5_000_000n, period: 86_400n },
      { token: tokens[1], amount: 7_000_000n, period: 86_400n },
    ]);
    expect(r.allowedCalls.map((s) => s.target)).toEqual([router, getAddress(Addresses.pathUsd), ...tokens]);
    expect(r.allowedCalls[0]!.selectorRules).toEqual([{ selector: REBALANCE_SELECTOR, recipients: [] }]);
    for (const s of r.allowedCalls.slice(1)) expect(s.selectorRules).toEqual([{ selector: APPROVE_SELECTOR, recipients: [router] }]);
  });

  it("refuses duplicate tokens and mismatched limits", () => {
    expect(() => themeKeyAuthorizeCall({ ...p, tokens: [tokens[0]!, tokens[0]!] })).toThrow(/duplicate/);
    expect(() => themeKeyAuthorizeCall({ ...p, tokenDailyLimits: [1n] })).toThrow(/one daily limit/);
  });

  it("split chunks carry at most 5 targets each", () => {
    const many = Array.from({ length: 12 }, (_, i) => getAddress(`0x20c0000000000000000000000000000000001${i.toString(16).padStart(3, "0")}`));
    const chunks = themeKeySetAllowedCallsChunks(keyId, themeKeyScopes({ router, tokens: many }).slice(2));
    expect(chunks.length).toBe(3);
    const sizes = chunks.map((c) => (decodeFunctionData({ abi: Abis.accountKeychain, data: c.data }).args as unknown as [string, unknown[]])[1].length);
    expect(sizes).toEqual([5, 5, 2]);
  });

  it("viem key_authorization shape mirrors the same scopes, recipient-bound approves only", () => {
    const a = themeKeyAuthorization(p);
    expect(a.expiry).toBe(1_800_000_000);
    expect(a.scopes).toEqual([
      { address: router, selector: REBALANCE_SELECTOR },
      ...[getAddress(Addresses.pathUsd), ...tokens].map((address) => ({ address, selector: APPROVE_SELECTOR, recipients: [router] })),
    ]);
  });
});
