import { describe, expect, it } from "vitest";
import type { AbiFunction } from "viem";
import { guardPolicy } from "./guard";

describe("guard relay policy", () => {
  it("targets the deployed StockReference and StockGuardHook and sponsors nothing in 15b", () => {
    const t = guardPolicy.targets.map((a) => a.toLowerCase());
    expect(t).toContain("0xccbc2e760c22dbbdb3e1c2458c98593942a7bd90");
    expect(t).toContain("0xfb0579c1dbffbbabb05834998b5542b9bd4fa0c0");
    expect(guardPolicy.sponsor).toEqual([]);
  });

  it("names only functions the contracts really have", () => {
    const names = new Set(guardPolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of guardPolicy.never) expect(names.has(n), n).toBe(true);
    expect(names.has("pushRedStone")).toBe(true);
  });
});
