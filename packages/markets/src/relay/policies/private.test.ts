import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { privatePolicy } from "./private";
import { POLICIES } from "./index";

describe("private relay policy", () => {
  const fns = privatePolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the desk really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...privatePolicy.sponsor, ...privatePolicy.never, ...privatePolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors the owner's exits and the crank; never intake, delegation, the desk key's writes or admin", () => {
    expect([...privatePolicy.sponsor].sort()).toEqual(["revoke", "settleSlot", "sweep", "withdraw"]);
    for (const n of ["deposit", "depositAndAllow", "allow", "chargeToPool", "fundSlot", "mintInSlot", "sweepSlotToPool", "creditFromPool", "setDesk"]) {
      expect(privatePolicy.never, n).toContain(n);
    }
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...privatePolicy.sponsor, ...privatePolicy.never], n).toContain(n);
  });

  it("no payable entry, and no sponsored call takes a payout destination (AD-5)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
    for (const f of fns.filter((f) => privatePolicy.sponsor.includes(f.name))) {
      expect(f.inputs.some((i) => i.type === "address"), f.name).toBe(false);
    }
  });

  it("targets the deployed Moderato desk and is registered", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const r = d["42431"]?.private?.contracts.PrivateDesk?.address.toLowerCase();
    expect(r).toBeDefined();
    expect(privatePolicy.targets.map((t) => t.toLowerCase())).toContain(r);
    expect(POLICIES).toContain(privatePolicy);
  });
});
