import { describe, expect, it } from "vitest";
import { deploymentOf, deploymentsWithHistory, isDeployed } from "./deployments";

describe("deployments", () => {
  it("reads a generated fragment's contracts per chain and area", () => {
    const launch = deploymentOf("launch", 42431);
    expect(launch?.LaunchRegistry?.address.toLowerCase()).toBe("0x82480cce69a9a85d0c8515c5b2ddded6e0ea94a3"); // registry v2 (S17b, D-096)
    expect(launch?.LaunchRegistry?.deployBlock).toBeGreaterThan(0);
  });
  it("answers not deployed for an area with no fragment", () => {
    expect(isDeployed("arena", 42431)).toBe(false); // S12 games: no fragment yet
    expect(isDeployed("parlay", 42431)).toBe(true); // ParlayReserve (S10a, D-166)
    expect(isDeployed("vault", 42431)).toBe(true); // EventVault (S7, D-114)
    expect(isDeployed("engine", 42431)).toBe(true);
    expect(deploymentOf("launch", 4217)).toBeNull();
  });

  it("lists a contract's current address, then every one it replaced, newest first (D-213)", () => {
    const source = {
      "42431": {
        vault2: {
          contracts: {
            EventVaultV2: {
              address: "0x0000000000000000000000000000000000000003",
              deployBlock: 300,
              history: [
                { address: "0x0000000000000000000000000000000000000001", deployBlock: 100 },
                { address: "0x0000000000000000000000000000000000000002", deployBlock: 200 },
              ],
            },
          },
        },
      },
    };
    expect(deploymentsWithHistory("vault2", "EventVaultV2", 42431, source).map((d) => [d.address.slice(-1), d.deployBlock])).toEqual([["3", 300], ["2", 200], ["1", 100]]);
    expect(deploymentsWithHistory("vault2", "EventVaultV2", 4217, source)).toEqual([]);
    expect(deploymentsWithHistory("vault", "EventVault", 42431, source)).toEqual([]);
  });
});
