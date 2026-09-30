import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { leveragePolicy } from "./leverage";
import { POLICIES } from "./index";

describe("leverage relay policy", () => {
  const fns = leveragePolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the reserve really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...leveragePolicy.sponsor, ...leveragePolicy.never, ...leveragePolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors the owner's trade and exit and the cranks; never intake or admin", () => {
    expect([...leveragePolicy.sponsor].sort()).toEqual(["claimOwed", "close", "knockOut", "open", "settle", "sweep", "withdraw"]);
    expect([...leveragePolicy.never].sort()).toEqual(["setAdmin", "setParams", "setPaused", "supply"]);
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...leveragePolicy.sponsor, ...leveragePolicy.never], n).toContain(n);
    expect(leveragePolicy.entry).toEqual(["open"]);
  });

  it("no payable entry and no payout destination in the ABI (AD-5)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
    for (const f of fns.filter((f) => /^(withdraw|claim|close|knock|settle|sweep)/i.test(f.name))) {
      expect(f.inputs.some((i) => i.type === "address"), f.name).toBe(false);
    }
  });

  it("targets the deployed Moderato reserve and is registered", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const r = d["42431"]?.leverage?.contracts.LeverageReserve?.address.toLowerCase();
    expect(r).toBeDefined();
    expect(leveragePolicy.targets.map((t) => t.toLowerCase())).toContain(r);
    expect(POLICIES).toContain(leveragePolicy);
  });
});
