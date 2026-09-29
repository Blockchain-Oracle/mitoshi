import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { deployments } from "@cwf/clients";
import { enginePolicy } from "./engine";

describe("engine relay policy", () => {
  it("names only functions the engine really has (no drift from the generated ABI)", () => {
    const names = new Set(enginePolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...enginePolicy.sponsor, ...enginePolicy.never, ...enginePolicy.entry]) expect(names.has(n), n).toBe(true);
  });

  it("never sponsors the admin or roller surface, and keeps capital intake unsponsored", () => {
    for (const n of enginePolicy.never) expect(enginePolicy.sponsor).not.toContain(n);
    expect(enginePolicy.sponsor).not.toContain("mintSet");
    expect(enginePolicy.never).toContain("openWindow");
  });

  it("targets the deployed Moderato engine", () => {
    const d = deployments as unknown as Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
    const engine = d["42431"]?.engine?.contracts.EventsEngine?.address.toLowerCase();
    expect(engine).toBeDefined();
    expect(enginePolicy.targets.map((t) => t.toLowerCase())).toContain(engine);
  });
});
