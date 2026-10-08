import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { rangePolicy } from "./range";
import { POLICIES } from "./index";

describe("range relay policy", () => {
  const fns = rangePolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the reserve really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...rangePolicy.sponsor, ...rangePolicy.never, ...rangePolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors the opener's round, cranks and exits; never intake or admin", () => {
    expect([...rangePolicy.sponsor].sort()).toEqual(["claim", "claimOwed", "openRange", "settle", "voidStale", "withdraw"]);
    expect([...rangePolicy.never].sort()).toEqual(["setAdmin", "setAssetTicker", "setParams", "setPaused", "setVolatility", "supply"]);
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...rangePolicy.sponsor, ...rangePolicy.never], n).toContain(n);
    expect(rangePolicy.entry).toEqual(["openRange"]);
  });

  it("no payable entry and no payout destination in the ABI (AD-5)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
    for (const f of fns.filter((f) => /^(withdraw|claim|settle|void)/i.test(f.name))) {
      expect(f.inputs.some((i) => i.type === "address"), f.name).toBe(false);
    }
  });

  it("targets the deployed Moderato reserve and is registered", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const r = d["42431"]?.range?.contracts.RangeReserve?.address.toLowerCase();
    expect(r).toBeDefined();
    expect(rangePolicy.targets.map((t) => t.toLowerCase())).toContain(r);
    expect(POLICIES).toContain(rangePolicy);
  });
});
