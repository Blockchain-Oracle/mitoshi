import { describe, expect, it } from "vitest";
import { toFunctionSelector, type AbiFunction } from "viem";
import { launchPolicy } from "./launch";

describe("launch relay policy", () => {
  it("targets the deployed registry and sponsors nothing in 17a", () => {
    expect(launchPolicy.targets.map((t) => t.toLowerCase())).toContain("0x9b664b9b73497aa140eda23a81fcc3db279c50b7");
    expect(launchPolicy.sponsor).toEqual([]);
  });

  it("names only functions the registry really has (no drift from the generated ABI)", () => {
    const names = new Set(launchPolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...launchPolicy.never, ...launchPolicy.sponsor]) expect(names.has(n), n).toBe(true);
    expect(launchPolicy.never).toContain("recordStablecoin");
    expect(toFunctionSelector(launchPolicy.abi.find((e): e is AbiFunction => e.type === "function" && e.name === "recordStablecoin")!)).toMatch(/^0x/);
  });
});
