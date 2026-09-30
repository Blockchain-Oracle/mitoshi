import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, type AbiFunction, type Address, type Hex } from "viem";
import { deployments, TEMPO } from "@cwf/clients";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { OPEN_POSTURE } from "@cwf/core";
import { evaluate } from "../engine";
import type { RelayReader, RelayRequest } from "../types";
import { vaultPolicy } from "./vault";

const VAULT = vaultPolicy.targets[0]!;
const KEY = "0x00000000000000000000000000000000000000a1" as Address;
const FOREIGN = "0x00000000000000000000000000000000000000b2" as Address;
const FEE_PAYER = "0x00000000000000000000000000000000000000fe" as Address;
const MARKET = `0x${"42".repeat(32)}` as Hex;
const ctx = { method: "eth_fillTransaction", device: "dev-1", region: OPEN_POSTURE, nowSec: 1_000 };
const config = (reader?: RelayReader) => ({ chainId: 42431, feePayer: FEE_PAYER, policies: [vaultPolicy], ...(reader ? { reader } : {}) });
const tap = (grantId: bigint) => ({ to: VAULT, data: encodeFunctionData({ abi: eventVaultAbi, functionName: "placeFor", args: [grantId, MARKET, 0, true, 520_000n, 1_000_000n, maxUint256 >> 192n] }), value: 0n });
const req = (from: Address, grantId: bigint): RelayRequest => ({ chainId: 42431, from, calls: [tap(grantId)], gas: 3_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD as Address, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });

/** The chain's answers for three grants, as `grantOf` / `isGrantLive` return them (the relay reads nothing else). */
const GRANTS: Record<string, { actor: Address; live: boolean }> = { "7": { actor: KEY, live: true }, "8": { actor: KEY, live: false }, "9": { actor: FOREIGN, live: true } };
const reads: string[] = [];
const reader: RelayReader = {
  readContract: async ({ functionName, args }) => {
    const id = String(args?.[0]);
    reads.push(`${functionName}(${id})`);
    const g = GRANTS[id];
    if (!g) throw new Error("NoSuchGrant");
    return functionName === "isGrantLive" ? g.live : { actor: g.actor };
  },
};

describe("vault relay policy", () => {
  it("names only functions the vault really has (no drift from the generated ABI)", () => {
    const names = new Set(vaultPolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...vaultPolicy.sponsor, ...vaultPolicy.never, ...vaultPolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors Masayume's list and never capital intake or delegation setup", () => {
    expect([...vaultPolicy.sponsor].sort()).toEqual(["crankSettle", "placeFor", "revoke", "sweep", "withdraw", "withdrawPrivate"]);
    expect([...vaultPolicy.never].sort()).toEqual(["deposit", "depositAndGrant", "fundGrant", "grant"]);
    for (const n of vaultPolicy.never) expect(vaultPolicy.sponsor).not.toContain(n);
    // Q-021 default: unchanged from Masayume — the owner's own place and moveToPrivate are not sponsored.
    for (const n of ["place", "moveToPrivate", "creditFor", "creditPrivateFor"]) expect(vaultPolicy.sponsor).not.toContain(n);
  });

  it("the vault ABI has no forwarder surface and no payout destination (D-003, P6)", () => {
    const fns = vaultPolicy.abi.filter((e): e is AbiFunction => e.type === "function");
    expect(fns.map((f) => f.name)).not.toContain("isTrustedForwarder");
    for (const f of fns.filter((f) => /^(withdraw|claim|redeem)/i.test(f.name))) {
      expect(f.inputs.some((i) => i.type === "address"), f.name).toBe(false);
    }
  });

  it("targets the deployed Moderato vault", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const vault = d["42431"]?.vault?.contracts.EventVault?.address.toLowerCase();
    expect(vault).toBeDefined();
    expect(vaultPolicy.targets.map((t) => t.toLowerCase())).toContain(vault);
  });
});

describe("vault relay policy — the async sender rule (C.3.3, S7)", () => {
  it("sponsors placeFor from the grant's own actor while the grant is live", async () => {
    expect(await evaluate(config(reader), req(KEY, 7n), ctx)).toMatchObject({ ok: true, area: "vault" });
  });

  it("refuses a foreign sender on someone else's live grant", async () => {
    expect(await evaluate(config(reader), req(FOREIGN, 7n), ctx)).toMatchObject({ ok: false, code: "sender" });
    expect(await evaluate(config(reader), req(KEY, 9n), ctx)).toMatchObject({ ok: false, code: "sender" });
  });

  it("refuses the actor once the grant is revoked or expired, and an unknown grant", async () => {
    expect(await evaluate(config(reader), req(KEY, 8n), ctx)).toMatchObject({ ok: false, code: "sender" });
    expect(await evaluate(config(reader), req(KEY, 404n), ctx)).toMatchObject({ ok: false, code: "sender" });
  });

  it("fails closed without a chain reader", async () => {
    expect(await evaluate(config(), req(KEY, 7n), ctx)).toMatchObject({ ok: false, code: "sender" });
  });

  it("reads both facts on chain, remembers a live answer briefly, and never remembers a refusal", async () => {
    reads.length = 0;
    await evaluate(config(reader), req(FOREIGN, 9n), ctx);
    await evaluate(config(reader), req(FOREIGN, 9n), ctx);
    expect(reads.filter((r) => r.endsWith("(9)"))).toEqual(["grantOf(9)", "isGrantLive(9)"]);
    reads.length = 0;
    await evaluate(config(reader), req(KEY, 9n), ctx);
    await evaluate(config(reader), req(KEY, 9n), ctx);
    expect(reads).toHaveLength(4);
  });

  it("exits need no grant: revoke, withdraw and crankSettle pass the rule for anyone", async () => {
    const withdraw = { to: VAULT, data: encodeFunctionData({ abi: eventVaultAbi, functionName: "withdraw", args: [1n] }), value: 0n };
    expect(await evaluate(config(), { ...req(FOREIGN, 7n), calls: [withdraw] }, ctx)).toMatchObject({ ok: true, area: "vault" });
  });
});

