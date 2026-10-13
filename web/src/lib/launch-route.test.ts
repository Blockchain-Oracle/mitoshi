import { describe, expect, it } from "vitest";
import { isLaunchVoid } from "./launch-route";

describe("isLaunchVoid", () => {
  it("leaves the launch pages and launchable TIP-20 addresses alone", () => {
    expect(isLaunchVoid("/launch")).toBe(false);
    expect(isLaunchVoid("/launch/meme")).toBe(false);
    expect(isLaunchVoid("/launch/stablecoin")).toBe(false);
    expect(isLaunchVoid("/launch/0x20C000000000000000000000481A1099D2183bc4")).toBe(false);
  });

  it("voids what can't be a launch: not an address, outside the TIP-20 range, or in its reserved low range", () => {
    expect(isLaunchVoid("/launch/nonsense")).toBe(true);
    expect(isLaunchVoid("/launch/0x0000000000000000000000000000000000000001")).toBe(true);
    expect(isLaunchVoid("/launch/0x20C0000000000000000000000000000000000000")).toBe(true);
    expect(isLaunchVoid("/launch/0x20c00000000000000000000000000000000003e7")).toBe(true);
  });
});
