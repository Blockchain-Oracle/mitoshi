import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { strategiesPolicy } from "./strategies";
import { POLICIES } from "./index";

describe("strategies relay policy", () => {
  const fns = strategiesPolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the registry really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...strategiesPolicy.sponsor, ...strategiesPolicy.never]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors the exits only; the fee, the build and admin are never sponsored", () => {
    expect([...strategiesPolicy.sponsor].sort()).toEqual(["deactivate", "unsubscribe"]);
    expect([...strategiesPolicy.never].sort()).toEqual(["publish", "setRunner", "subscribe", "update"]);
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...strategiesPolicy.sponsor, ...strategiesPolicy.never], n).toContain(n);
    expect(strategiesPolicy.entry).toEqual([]);
  });

  it("no payable entry (AD-5)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
  });

  it("targets the deployed Moderato registry and is registered", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const r = d["42431"]?.strategies?.contracts.StrategyRegistry?.address.toLowerCase();
    expect(r).toBe("0x79156a899bc8cb773d8b70ecd0392c78ee9fb8fd");
    expect(strategiesPolicy.targets.map((t) => t.toLowerCase())).toContain(r);
    expect(POLICIES).toContain(strategiesPolicy);
  });
});
