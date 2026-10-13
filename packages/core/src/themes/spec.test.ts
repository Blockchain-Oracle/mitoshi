import { describe, expect, it } from "vitest";
import { bandAround, canonicalJson, specFromUri, specPayload, type ThemeSpec } from "./spec";

const spec: ThemeSpec = {
  schema: 1, name: "AI builders", blurb: "Chips and clouds", creatorFeeBps: 25, maxSlippageBps: 100, minIntervalSec: 3_600, maxRefAgeSec: 345_600, sessionsMask: 1,
  bands: [{ token: "0x20c000000000000000000000a81E861906820FB7", symbol: "TSLA", minBps: 4_300, targetBps: 5_000, maxBps: 5_700, allowed: true }],
  cashBand: { minBps: 0, targetBps: 5_000, maxBps: 10_000 },
};

describe("theme spec (S16a TH-02, R4-11)", () => {
  it("canonical JSON sorts keys at every depth with no whitespace (RFC 8785 for these types)", () => {
    expect(canonicalJson({ b: 1, a: [{ d: true, c: "x" }], e: null })).toBe('{"a":[{"c":"x","d":true}],"b":1,"e":null}');
    expect(canonicalJson({ z: "é " })).toBe('{"z":"é "}');
    expect(() => canonicalJson({ x: 0.5 })).toThrow();
  });
  it("the data URI carries the canonical bytes and reads back to the same spec", () => {
    const p = specPayload(spec);
    expect(p.uri.startsWith("data:application/json;base64,")).toBe(true);
    expect(new TextDecoder().decode(p.bytes)).toBe(p.canonical);
    expect(specFromUri(p.uri)).toEqual(spec);
    expect(specFromUri("https://example.com/spec.json")).toBeNull();
  });
  it("envelope presets keep the band inside 0…100 % around the target", () => {
    expect(bandAround(5_000, "balanced")).toEqual({ minBps: 4_300, targetBps: 5_000, maxBps: 5_700 });
    expect(bandAround(200, "loose")).toEqual({ minBps: 0, targetBps: 200, maxBps: 1_700 });
  });
});
