import { describe, expect, it } from "vitest";
import { overallOf, worstTally } from "./grade";

const critical = new Set(["chain-head", "settler"]);

describe("the status verdict", () => {
  it("never calls a warning all systems live", () => {
    expect(overallOf([{ id: "indexer", tone: "good" }, { id: "archive", tone: "warn" }], critical)).toBe("degraded");
    expect(overallOf([{ id: "indexer", tone: "good" }, { id: "archive", tone: "wait" }], critical)).toBe("waiting");
    expect(overallOf([{ id: "chain-head", tone: "bad" }], critical)).toBe("degraded");
    expect(overallOf([{ id: "indexer", tone: "good" }], critical)).toBe("healthy");
  });
  it("names the worst tone alone for the chip", () => {
    expect(worstTally([{ tone: "good" }, { tone: "wait" }, { tone: "warn" }, { tone: "warn" }])).toEqual({ tone: "warn", n: 2 });
    expect(worstTally([{ tone: "good" }])).toBeNull();
  });
});
