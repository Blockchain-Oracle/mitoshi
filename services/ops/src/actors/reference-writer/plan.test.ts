import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RedStonePackage } from "@cwf/core/prices/redstone";
import { feedName, nextChangeMs, plan, type MirrorState } from "./plan";

const fixtures = join(import.meta.dirname, "..", "..", "..", "..", "..", "contracts", "test", "fixtures", "prints");
const tsla = JSON.parse(readFileSync(join(fixtures, "redstone-tsla-1789396800.json"), "utf8")) as { packages: RedStonePackage[]; T: number; signers: string[] };
const T = tsla.T;
/** A signed-looking calendar datapoint (the plan only reads values; the chain verifies the pushed feeds). */
const cal = (value: number, tMs: number): RedStonePackage[] =>
  tsla.signers.slice(0, 3).map((s) => ({ timestampMilliseconds: tMs, signature: "", signerAddress: s, dataPoints: [{ dataFeedId: "NY_MARKET_NEXT_CHANGE_TIME", value: String(value) }] }));

const TSLA_MIRROR = "0x20c000000000000000000000a81E861906820FB7";
const NFLX_MIRROR = "0x20c000000000000000000000Abbbf91DE8978A6d";
const mirrors = (observedAtSec: number): MirrorState[] => [
  { ticker: "TSLA", mirror: TSLA_MIRROR, feed: "TSLA", observedAtSec },
  { ticker: "NFLX", mirror: NFLX_MIRROR, feed: "", observedAtSec: 0 },
];
// 2026-09-14 14:40Z is a Monday in regular hours; the next change is the 20:00Z close.
const CLOSE_MS = Date.parse("2026-09-14T20:00:00Z");
const all = { TSLA: tsla.packages, NY_MARKET_NEXT_CHANGE_TIME: cal(CLOSE_MS, T * 1000) };
const base = { nowMs: (T + 5) * 1000, all, threshold: 3, signers: tsla.signers, lastPushSec: new Map<string, number>(), onchainSession: { session: 3, untilSec: 0 }, lastCloseMs: null };

describe("reference-writer plan on the live gateway read of 2026-09-29 07:28:58Z (03:28 ET, Tuesday)", () => {
  const live = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "redstone-latest-1790666930.json"), "utf8")) as { packages: Record<string, RedStonePackage[]> };
  const prod = ["0xdEB22f54738d54976C4c0fe5ce6d408E40d88499", "0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE", "0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202", "0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de", "0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774"];
  const four: MirrorState[] = ["TSLA", "AMZN", "PLTR", "AMD"].map((t, i) => ({ ticker: t, mirror: `0x${String(i + 1).padStart(40, "0")}`, feed: t, observedAtSec: 0 }));

  it("pushes all four RedStone names and flags CLOSED (before 04:00 ET, next change = 09:30 ET open)", () => {
    const p = plan({ nowMs: Date.parse("2026-09-29T07:28:58Z"), all: live.packages, mirrors: four, threshold: 3, signers: prod, lastPushSec: new Map(), onchainSession: { session: 3, untilSec: 0 }, lastCloseMs: null });
    expect(nextChangeMs(live.packages, 3, prod)).toBe(Date.parse("2026-09-29T13:30:00Z"));
    expect(p.pushes.map((x) => x.ticker)).toEqual(["TSLA", "AMZN", "PLTR", "AMD"]);
    expect(p.pushes.every((x) => x.tSec === 1_790_666_930 && (x.payload.length - 2) / 2 === 5 * 142 + 14)).toBe(true);
    expect(p.pushes[0]!.medianE8).toBe(35_740_677_603n); // median of the 5 production signers, e-8
    expect(p.session?.session).toBe("CLOSED");
    expect(p.sessionWrite).toBe(true);
  });
});

describe("reference-writer plan", () => {
  it("pushes a newer signed spot, skips NFLX honestly, and writes REGULAR until the close", () => {
    const p = plan({ ...base, mirrors: mirrors(T - 30) });
    expect(p.pushes).toHaveLength(1);
    expect(p.pushes[0]).toMatchObject({ ticker: "TSLA", tSec: T, medianE8: 35_818_500_933n });
    expect(p.pushes[0]!.payload).toBe(`0x${readFileSync(join(fixtures, "redstone-tsla-1789396800.hex"), "utf8").trim()}`);
    expect(p.skipped).toEqual(["NFLX: no signed source"]);
    expect(p.session).toMatchObject({ session: "REGULAR", closeMs: CLOSE_MS });
    expect(p.sessionWrite).toBe(true);
  });

  it("never re-pushes what the chain already has and throttles to the session's cadence", () => {
    expect(plan({ ...base, mirrors: mirrors(T) }).pushes).toHaveLength(0);
    const recent = new Map([[TSLA_MIRROR, T - 10]]);
    expect(plan({ ...base, mirrors: mirrors(T - 10), lastPushSec: recent }).pushes).toHaveLength(0); // < 30 s in REGULAR
    expect(plan({ ...base, mirrors: mirrors(T - 40), lastPushSec: new Map([[TSLA_MIRROR, T - 40]]) }).pushes).toHaveLength(1);
  });

  it("keeps a valid flag, rewrites it before it lapses", () => {
    const fresh = plan({ ...base, mirrors: mirrors(T), onchainSession: { session: 0, untilSec: T + 900 } });
    expect(fresh.sessionWrite).toBe(false);
    const lapsing = plan({ ...base, mirrors: mirrors(T), onchainSession: { session: 0, untilSec: T + 60 } });
    expect(lapsing.sessionWrite).toBe(true);
  });

  it("decodes feed names and the signed next change", () => {
    expect(feedName("0x54534c4100000000000000000000000000000000000000000000000000000000")).toBe("TSLA");
    expect(feedName(`0x${"0".repeat(64)}`)).toBe("");
    expect(nextChangeMs(all, 3, tsla.signers)).toBe(CLOSE_MS);
    expect(nextChangeMs(all, 4, tsla.signers)).toBeNull();
  });
});
