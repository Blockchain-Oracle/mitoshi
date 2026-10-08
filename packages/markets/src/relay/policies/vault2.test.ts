import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { vaultPolicy } from "./vault";
import { vault2Policy } from "./vault2";

describe("vault v2 relay policy (S24.1)", () => {
  it("is v1's list plus the EXIT grant: arming it is never sponsored, the keeper's sale is never asked of the relay", () => {
    const names = new Set(vault2Policy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...vault2Policy.sponsor, ...vault2Policy.never, ...vault2Policy.entry]) expect(names.has(n), n).toBe(true);
    expect(vault2Policy.sponsor).toEqual(vaultPolicy.sponsor);
    expect(vault2Policy.never).toContain("grantExit");
    for (const intake of ["deposit", "depositAndGrant", "grant", "fundGrant"]) expect(vault2Policy.never).toContain(intake);
    expect([...vault2Policy.sponsor, ...vault2Policy.never]).not.toContain("exitFor");
    expect(vault2Policy.targets.length).toBeGreaterThan(0);
  });
});
