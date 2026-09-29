import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { vaultPolicy } from "./vault";

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
