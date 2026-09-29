import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { makerPolicy } from "./maker";

describe("maker relay policy", () => {
  const fns = makerPolicy.abi.filter((e): e is AbiFunction => e.type === "function");

  it("names only functions the vault really has (no drift from the generated ABI)", () => {
    const names = new Set(fns.map((f) => f.name));
    for (const n of [...makerPolicy.sponsor, ...makerPolicy.never, ...makerPolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("sponsors exits and keeper calls; never intake, quoting or admin", () => {
    expect([...makerPolicy.sponsor].sort()).toEqual(["merge", "pull", "settle", "withdraw"]);
    expect([...makerPolicy.never].sort()).toEqual(["quote", "setAdmin", "setMaker", "setParams", "setPaused", "supply"]);
    for (const n of makerPolicy.never) expect(makerPolicy.sponsor).not.toContain(n);
    // every state-changing function is classified one way or the other
    const writes = fns.filter((f) => f.stateMutability === "nonpayable").map((f) => f.name);
    for (const n of writes) expect([...makerPolicy.sponsor, ...makerPolicy.never], n).toContain(n);
  });

  it("the vault ABI has no payable entry and no payout destination (P6)", () => {
    expect(fns.filter((f) => f.stateMutability === "payable")).toEqual([]);
    for (const f of fns.filter((f) => /^(withdraw|claim|redeem|settle|pull|merge)/i.test(f.name))) {
      expect(f.inputs.some((i) => i.type === "address"), f.name).toBe(false);
    }
  });

  it("targets the deployed Moderato maker vault", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const vault = d["42431"]?.maker?.contracts.MarketMakerVault?.address.toLowerCase();
    expect(vault).toBeDefined();
    expect(makerPolicy.targets.map((t) => t.toLowerCase())).toContain(vault);
  });
});
