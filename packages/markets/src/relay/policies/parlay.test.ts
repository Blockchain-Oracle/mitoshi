import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { parlayPolicy } from "./parlay";
import { POLICIES } from "./index";

describe("parlay relay policy", () => {
  const fns = parlayPolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the reserve really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...parlayPolicy.sponsor, ...parlayPolicy.never, ...parlayPolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors the opener's trade, cranks and exits; never intake or admin", () => {
    expect([...parlayPolicy.sponsor].sort()).toEqual(["claim", "claimOwed", "openParlay", "resolveLeg", "withdraw"]);
    expect([...parlayPolicy.never].sort()).toEqual(["setAdmin", "setParams", "setPaused", "supply"]);
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...parlayPolicy.sponsor, ...parlayPolicy.never], n).toContain(n);
    expect(parlayPolicy.entry).toEqual(["openParlay"]);
  });

  it("no payable entry and no payout destination in the ABI (AD-5)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
    for (const f of fns.filter((f) => /^(withdraw|claim|resolve)/i.test(f.name))) {
      expect(f.inputs.some((i) => i.type === "address"), f.name).toBe(false);
    }
  });

  it("targets the deployed Moderato reserve and is registered", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const r = d["42431"]?.parlay?.contracts.ParlayReserve?.address.toLowerCase();
    expect(r).toBeDefined();
    expect(parlayPolicy.targets.map((t) => t.toLowerCase())).toContain(r);
    expect(POLICIES).toContain(parlayPolicy);
  });
});
