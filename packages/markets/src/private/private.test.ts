import { describe, expect, it } from "vitest";
import { createWalletClient, encodeErrorResult, http, keccak256, maxUint256, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { OPEN_POSTURE, toMarketId, type TxIntent } from "@cwf/core";
import { privateOpenMessage, type PrivateClaim } from "@cwf/core/private";
import { TEMPO } from "@cwf/clients";
import { privateDeskAbi } from "@cwf/clients/abis/PrivateDesk";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { claimDomain, signPrivateClaim, verifyPrivateClaim } from "./claim";
import { privateDeskOf } from "./deployment";
import { encodePrivateIntent } from "./encoders";
import { diagnosePrivate } from "./errors";
import { deriveSlotKeys, isSecret, secretCommitment } from "./keys";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const M = toMarketId(`0x${"a1".repeat(32)}`);
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "dev-1", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({
  chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 2_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null,
});
const encode = (intent: TxIntent) => {
  const r = encodePrivateIntent(intent, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error(`not encoded: ${JSON.stringify(r)}`);
  return r.value;
};
const secret = `0x${"5e".repeat(32)}` as Hex;

describe("the committed secret (C.2.4: P-256 signatures are randomised)", () => {
  it("derives the same three distinct keys from the same secret, different ones from another", () => {
    const a = deriveSlotKeys(secret);
    expect(deriveSlotKeys(secret)).toEqual(a);
    expect(new Set([a.slotId, a.chargeKey, a.creditKey]).size).toBe(3);
    expect(deriveSlotKeys(`0x${"5f".repeat(32)}`).slotId).not.toBe(a.slotId);
    expect(secretCommitment(secret)).toBe(keccak256(secret));
    expect(isSecret(secret)).toBe(true);
    expect(isSecret("0x1234")).toBe(false);
  });

  it("the signed text names the commitment, so a different secret is a different authorisation", () => {
    const base = { owner: USER, contract: privateDeskOf(CHAIN)!.privateDesk, chainId: CHAIN, marketId: M, asset: "BTC", cadenceText: "5m", expirySec: 1_900_000_000, side: "up" as const, stakeText: "5", symbol: "pathUSD", issuedAtMs: 1_800_000_000_000 };
    const text = privateOpenMessage({ ...base, commitment: secretCommitment(secret) });
    expect(text).toContain(`Keys: ${secretCommitment(secret)}`);
    expect(text).toContain("not anonymous");
    expect(privateOpenMessage({ ...base, commitment: secretCommitment(`0x${"5f".repeat(32)}`) })).not.toBe(text);
  });
});

describe("the desk's claim (EIP-712 over the deployed contract)", () => {
  const deskKey = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({ account: deskKey, transport: http("http://127.0.0.1:1") });
  const domain = claimDomain(CHAIN, privateDeskOf(CHAIN)!.privateDesk);
  const keys = deriveSlotKeys(secret);
  const claim: PrivateClaim = { owner: USER, slotId: keys.slotId, creditKey: keys.creditKey, marketId: M, outcomeIdx: 0, stakeBase: "5000000", issuedAtMs: 1_800_000_000_000 };

  it("verifies against the desk that signed it and nobody else; an edited stake fails", async () => {
    const signature = await signPrivateClaim(wallet, domain, claim);
    expect(await verifyPrivateClaim(domain, claim, signature, deskKey.address)).toBe(true);
    expect(await verifyPrivateClaim(domain, claim, signature, USER)).toBe(false);
    expect(await verifyPrivateClaim(domain, { ...claim, stakeBase: "25000000" }, signature, deskKey.address)).toBe(false);
    expect(await verifyPrivateClaim(claimDomain(4217, domain.verifyingContract), claim, signature, deskKey.address)).toBe(false);
  });
});

describe("private intents → the relay (D-177)", () => {
  it("a top-up is capital intake: [approve(desk), depositAndAllow] self-paid, refused by the relay", async () => {
    const e = encode({ kind: "private-deposit-and-allow", amountBase: 5_000_000n, allowanceBase: 5_000_000n });
    expect(e.sponsored).toBe(false);
    expect(e.calls.map((c) => c.to.toLowerCase())).toEqual([TEMPO.pathUSD.toLowerCase(), privateDeskOf(CHAIN)!.privateDesk.toLowerCase()]);
    expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: false });
    const reallow = encode({ kind: "private-deposit-and-allow", amountBase: 0n, allowanceBase: 3_000_000n });
    expect(reallow.calls).toHaveLength(1);
    expect(reallow.sponsored).toBe(false);
  });

  it("withdraw, revoke and the permissionless settle are sponsored", async () => {
    for (const intent of [{ kind: "private-withdraw", amountBase: 1n }, { kind: "private-revoke" }, { kind: "private-settle", slotId: deriveSlotKeys(secret).slotId, marketId: M }] as TxIntent[]) {
      const e = encode(intent);
      expect(e.sponsored).toBe(true);
      expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "private" });
    }
    expect(encodePrivateIntent({ kind: "noop" } as TxIntent, { chainId: CHAIN, wallet: USER })).toBeNull();
  });

  it("names the desk's refusals with their figures", () => {
    const data = encodeErrorResult({ abi: privateDeskAbi, errorName: "StakeOutsideBand", args: [30_000_000n, 1_000_000n, 25_000_000n] });
    expect(diagnosePrivate({ data })).toMatchObject({ kind: "outside-band", errorName: "StakeOutsideBand" });
    const over = encodeErrorResult({ abi: privateDeskAbi, errorName: "OverAllowance", args: [6_000_000n, 5_000_000n] });
    expect(diagnosePrivate({ cause: { data: over } })).toMatchObject({ kind: "spending-limit", errorName: "OverAllowance" });
  });
});
