import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { arenaPolicy } from "./arena";
import { POLICIES } from "./index";

describe("arena relay policy", () => {
  const fns = arenaPolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the arena really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...arenaPolicy.sponsor, ...arenaPolicy.never, ...arenaPolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors exits and cranks; never a pot, a stake, a key grant, the reveal or admin — every write is classified", () => {
    for (const n of ["createMatch", "joinMatch", "placePick", "placePickFor", "authorizeAgent", "revealDeck", "setTier"]) expect(arenaPolicy.never, n).toContain(n);
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...arenaPolicy.sponsor, ...arenaPolicy.never], n).toContain(n);
  });

  it("no payable entry; the one sponsored call that names an address pays that player, never the caller (AD-5)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
    const named = fns.filter((f) => arenaPolicy.sponsor.includes(f.name) && f.inputs.some((i) => i.type === "address")).map((f) => f.name);
    expect(named).toEqual(["claimCredit"]);
  });

  it("targets the deployed Moderato arena and is registered", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const a = d["42431"]?.arena?.contracts.GameArena?.address.toLowerCase();
    expect(a).toBeDefined();
    expect(arenaPolicy.targets.map((t) => t.toLowerCase())).toContain(a);
    expect(POLICIES).toContain(arenaPolicy);
  });
});
