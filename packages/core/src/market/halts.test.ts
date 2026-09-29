// Ported from Agari 03b30ab:packages/core/src/market/halts.test.ts (Tempo sources)
import { describe, expect, it } from "vitest";
import { HALT_REASONS, type HaltReason } from "../types/session-lanes";
import { confirmHalt, dataStreamsHaltReason, haltAssetOf, haltLabel, laneHaltReason, primarySourceAt, redstoneHaltReason, type HaltStreak, type SourceVersion } from "./halts";

const T = 1_789_156_800;
const utc = (iso: string) => Date.parse(iso) / 1000;

describe("source halts", () => {
  it("halts a RedStone feed whose newest package is over 60 s old, or signed by too few", () => {
    expect(redstoneHaltReason({ packageSec: T - 60, signers: 3 }, T)).toBeNull();
    expect(redstoneHaltReason({ packageSec: T - 61, signers: 5 }, T)).toBe("redstone-stale");
    expect(redstoneHaltReason({ packageSec: T, signers: 2 }, T)).toBe("redstone-signers");
    expect(redstoneHaltReason(null, T)).toBe("redstone-stale");
  });

  it("halts a stale Data Streams report and a closed-market one", () => {
    expect(dataStreamsHaltReason({ observationsSec: T - 10, marketOpen: true }, T)).toBeNull();
    expect(dataStreamsHaltReason({ observationsSec: T - 10, marketOpen: null }, T)).toBeNull();
    expect(dataStreamsHaltReason({ observationsSec: T - 10, marketOpen: false }, T)).toBe("datastreams-closed");
    expect(dataStreamsHaltReason({ observationsSec: T - 61, marketOpen: true }, T)).toBe("datastreams-stale");
  });
});

describe("which source a lane halts on", () => {
  const tsla: SourceVersion[] = [
    { validFromSec: utc("2026-09-11T00:00:00Z"), validUntilSec: utc("2026-09-25T20:00:00Z"), primary: "redstone" },
    { validFromSec: utc("2026-09-25T20:00:00Z"), validUntilSec: null, primary: "datastreams" },
  ];

  it("switches source at the version boundary and is paused (null) before the first", () => {
    expect(primarySourceAt(tsla, utc("2026-09-25T19:59:59Z"))).toBe("redstone");
    expect(primarySourceAt(tsla, utc("2026-09-25T20:00:00Z"))).toBe("datastreams");
    expect(primarySourceAt(tsla, utc("2026-09-10T23:59:59Z"))).toBeNull();
  });

  it("reads only the primary, and the exchange flag first", () => {
    const fresh = { redstone: { packageSec: T, signers: 5 }, datastreams: null, exchangeTradable: true };
    expect(laneHaltReason("redstone", fresh, T)).toBeNull();
    expect(laneHaltReason("datastreams", fresh, T)).toBe("datastreams-stale");
    expect(laneHaltReason("redstone", { ...fresh, exchangeTradable: false }, T)).toBe("exchange-halt");
    expect(laneHaltReason(null, fresh, T)).toBeNull();
  });

  it("keys the 24/7 stock lane apart from the session lanes", () => {
    expect(haltAssetOf("TSLA", "regular")).toBe("TSLA");
    expect(haltAssetOf("TSLA", "stock24")).toBe("TSLA-24");
    expect(haltAssetOf("BTC", "crypto24")).toBe("BTC");
  });
});

describe("confirming a halt", () => {
  const run = (observations: Array<HaltReason | null>) => {
    let state: { confirmed: HaltReason | null; streak: HaltStreak | null } = { confirmed: null, streak: null };
    return observations.map((observed) => (state = confirmHalt(state.confirmed, state.streak, observed)).confirmed);
  };

  it("needs two observations in a row to set or clear, and one for the exchange's flag", () => {
    expect(run(["redstone-stale", null, "redstone-stale", "redstone-stale", null, null])).toEqual([null, null, null, "redstone-stale", "redstone-stale", null]);
    expect(run(["exchange-halt", null, null])).toEqual(["exchange-halt", "exchange-halt", null]);
  });
});

it("says Trading halted only for the exchange's halt or a closed market (Q-S6-9)", () => {
  expect(Object.fromEntries(HALT_REASONS.map((r) => [r, haltLabel(r)]))).toEqual({
    "redstone-stale": "Signed price stale",
    "redstone-signers": "Signed price stale",
    "datastreams-stale": "Signed price stale",
    "datastreams-closed": "Trading halted",
    "exchange-halt": "Trading halted",
  });
});
