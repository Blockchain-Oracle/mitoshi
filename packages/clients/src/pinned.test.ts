import { describe, expect, it } from "vitest";
import { getAddress, isAddress } from "viem";
import * as pinned from "./pinned";

function collect(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string" && value.startsWith("0x")) out.push([path, value]);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) collect(v, `${path}.${k}`, out);
}

describe("pinned addresses", () => {
  const all: [string, string][] = [];
  collect(pinned, "pinned", all);

  it("are all well-formed 20-byte addresses with a valid checksum when mixed-case", () => {
    expect(all.length).toBeGreaterThan(50);
    for (const [path, value] of all) {
      expect(isAddress(value, { strict: false }), path).toBe(true);
      const mixed = value !== value.toLowerCase() && value.slice(2) !== value.slice(2).toUpperCase();
      if (mixed) expect(getAddress(value), `${path} checksum`).toBe(value);
    }
  });

  it("keeps the v4 router pinned to the plan's address", () => {
    expect(pinned.UNISWAP_V4.universalRouter).toBe("0xa2dc7d0266f0cc50b3eeaf36c9bfcecff1beea91");
  });
});
