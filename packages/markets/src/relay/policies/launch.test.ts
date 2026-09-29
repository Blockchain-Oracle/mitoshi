import { describe, expect, it } from "vitest";
import { type AbiFunction, getAddress } from "viem";
import { deployments } from "@cwf/clients";
import { launchPolicy } from "./launch";

const launch = deployments[42431].launch.contracts;

describe("launch relay policy", () => {
  it("targets the deployed registry, launchpad and locker (not the linked libraries' callers)", () => {
    const t = launchPolicy.targets.map((x) => getAddress(x));
    for (const c of [launch.LaunchRegistry, launch.CurveLaunchpad, launch.LiquidityLocker]) expect(t).toContain(getAddress(c.address));
  });

  it("sponsors the holder's own trades and claims; never admin; graduate and createConfig pay their own way", () => {
    expect(launchPolicy.sponsor).toEqual(["createLaunch", "buy", "sell", "claimFees", "claimLeftover", "withdraw"]);
    for (const n of ["graduate", "createConfig", "recordStablecoin"]) expect(launchPolicy.sponsor).not.toContain(n);
    expect(launchPolicy.never).toEqual(expect.arrayContaining(["recordStablecoin", "recordMemecoin", "setCurveLaunchpad", "unlockCallback", "register"]));
  });

  it("names only functions the contracts really have (no drift from the generated ABIs)", () => {
    const names = new Set(launchPolicy.abi.filter((e): e is AbiFunction => e.type === "function").map((f) => f.name));
    for (const n of [...launchPolicy.never, ...launchPolicy.sponsor, "graduate", "createConfig"]) expect(names.has(n), n).toBe(true);
  });
});
