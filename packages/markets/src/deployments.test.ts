import { describe, expect, it } from "vitest";
import { deploymentOf, isDeployed } from "./deployments";

describe("deployments", () => {
  it("reads a generated fragment's contracts per chain and area", () => {
    const launch = deploymentOf("launch", 42431);
    expect(launch?.LaunchRegistry?.address.toLowerCase()).toBe("0x9b664b9b73497aa140eda23a81fcc3db279c50b7");
    expect(launch?.LaunchRegistry?.deployBlock).toBeGreaterThan(0);
  });
  it("answers not deployed for an area with no fragment", () => {
    expect(isDeployed("vault", 42431)).toBe(false);
    expect(isDeployed("engine", 42431)).toBe(true);
    expect(deploymentOf("launch", 4217)).toBeNull();
  });
});
