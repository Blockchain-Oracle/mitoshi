import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { latestSpot, packagesAt, redstonePayload, toHex, type RedStonePackage } from "./redstonePayload";

const fixtures = join(import.meta.dirname, "..", "..", "..", "..", "contracts", "test", "fixtures", "prints");

describe("RedStone wire payload (shared with RedStonePrintVerifier)", () => {
  it("rebuilds the archived TSLA payload byte for byte", () => {
    const j = JSON.parse(readFileSync(join(fixtures, "redstone-tsla-1789396800.json"), "utf8")) as { packages: RedStonePackage[]; T: number };
    const hex = readFileSync(join(fixtures, "redstone-tsla-1789396800.hex"), "utf8").trim();
    const all = { TSLA: j.packages };
    expect(toHex(redstonePayload(packagesAt(all, "TSLA", j.T * 1000), "TSLA")).slice(2)).toBe(hex);
    const spot = latestSpot(all, "TSLA", 3)!;
    expect(spot.tMs).toBe(j.T * 1000);
    expect(spot.medianE8).toBe(35_818_500_933n);
  });

  it("drops unconfigured signers and needs the threshold", () => {
    const j = JSON.parse(readFileSync(join(fixtures, "redstone-tsla-1789396800.json"), "utf8")) as { packages: RedStonePackage[] };
    const all = { TSLA: j.packages };
    const two = j.packages.slice(0, 2).map((p) => p.signerAddress);
    expect(latestSpot(all, "TSLA", 3, two)).toBeNull();
    expect(latestSpot(all, "TSLA", 2, two)!.packages).toHaveLength(2);
  });
});
