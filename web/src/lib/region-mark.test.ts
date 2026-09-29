// Ported from Agari 03b30ab:web/src/lib/region-mark.test.ts (per-pillar posture)
import { afterEach, describe, expect, it } from "vitest";
import { readRegionPosture } from "./region-mark";

const setCookie = (cookie: string) => Object.defineProperty(globalThis, "document", { value: { cookie }, configurable: true });
afterEach(() => Reflect.deleteProperty(globalThis, "document"));

describe("readRegionPosture", () => {
  it("is open with no document at all", () => expect(readRegionPosture()).toEqual({ markets: "open", stocks: "open", launch: "open" }));
  it("finds the mark beside other cookies", () => {
    setCookie("cwf_theme=light; cwf.region=markets%2Cstocks; x=abc");
    expect(readRegionPosture()).toEqual({ markets: "restricted", stocks: "restricted", launch: "open" });
  });
  it("does not match a cookie whose name merely ends the same way", () => {
    setCookie("not-cwf.region=markets");
    expect(readRegionPosture().markets).toBe("open");
  });
});
