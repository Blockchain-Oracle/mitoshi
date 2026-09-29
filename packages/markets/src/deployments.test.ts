import { describe, expect, it } from "vitest";
import { deploymentOf, isDeployed } from "./deployments";

describe("deployments", () => {
  it("reads a generated fragment's contracts per chain and area", () => {
    const launch = deploymentOf("launch", 42431);
    expect(launch?.LaunchRegistry?.address.toLowerCase()).toBe("0x82480cce69a9a85d0c8515c5b2ddded6e0ea94a3"); // registry v2 (S17b, D-096)
    expect(launch?.LaunchRegistry?.deployBlock).toBeGreaterThan(0);
  });
  it("answers not deployed for an area with no fragment", () => {
    expect(isDeployed("parlay", 42431)).toBe(false);
    expect(isDeployed("vault", 42431)).toBe(true); // EventVault (S7, D-114)
    expect(isDeployed("engine", 42431)).toBe(true);
    expect(deploymentOf("launch", 4217)).toBeNull();
  });
});
