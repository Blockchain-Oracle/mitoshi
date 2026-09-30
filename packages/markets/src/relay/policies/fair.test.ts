import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { fairPolicy } from "./fair";

describe("fair relay policy", () => {
  it("names only functions the guard really has", () => {
    const names = new Set(fairPolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...fairPolicy.sponsor, ...fairPolicy.never]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors nothing and never the owner surface", () => {
    expect(fairPolicy.sponsor).toEqual([]);
    const writes = fairPolicy.abi.filter((e): e is AbiFunction => e.type === "function" && e.stateMutability === "nonpayable").map((f) => f.name);
    // Every state-changing function is either the owner surface or a same-call read a reserve makes.
    for (const w of writes) expect([...fairPolicy.never, "fairUpE6", "spotOf"]).toContain(w);
  });

  it("targets the deployed Moderato guard", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const g = d["42431"]?.fair?.contracts.FairValueGuard?.address.toLowerCase();
    expect(g).toBeDefined();
    expect(fairPolicy.targets.map((t) => t.toLowerCase())).toContain(g);
  });
});
