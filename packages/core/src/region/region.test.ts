import { describe, expect, it } from "vitest";
import { decodePosture, encodePosture, OPEN_POSTURE, postureFromHeaders, postureOf, REGION_HEADER } from "./index";

describe("geofence posture (Q-008 default)", () => {
  it("holds US markets and stocks, stocks only for CA/GB/CH, and nothing for launch", () => {
    expect(postureOf("us")).toEqual({ markets: "restricted", stocks: "restricted", launch: "open" });
    expect(postureOf("GB")).toEqual({ markets: "open", stocks: "restricted", launch: "open" });
    expect(postureOf("DE")).toEqual(OPEN_POSTURE);
    expect(postureOf(null)).toEqual(OPEN_POSTURE);
    expect(postureOf("USA")).toEqual(OPEN_POSTURE);
  });

  it("round-trips through the cookie and the stamped headers", () => {
    const us = postureOf("US");
    expect(encodePosture(us)).toBe("markets,stocks");
    expect(decodePosture("markets,stocks")).toEqual(us);
    expect(decodePosture("")).toEqual(OPEN_POSTURE);
    const headers = new Map([[REGION_HEADER.stocks, "restricted"]]);
    expect(postureFromHeaders({ get: (n) => headers.get(n) ?? null })).toEqual({ markets: "open", stocks: "restricted", launch: "open" });
  });
});
