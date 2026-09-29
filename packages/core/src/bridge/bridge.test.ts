import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import { activeLegIndex, bridgeStatusOf, type LegStatus } from "./index";

describe("bridge status", () => {
  it.each(vectors.cases)("$legs → $status", (c) => {
    const legs = (c.legs as LegStatus[]).map((status) => ({ guid: null, status }));
    expect(bridgeStatusOf(legs)).toBe(c.status);
    expect(activeLegIndex(legs)).toBe(c.active);
  });
});
