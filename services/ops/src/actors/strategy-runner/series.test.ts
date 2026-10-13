import { describe, expect, it } from "vitest";
import type { BasketSpec, LaneBasis, TickerSymbol } from "@cwf/core";
import { seriesFor, weightOf, type SeriesRow } from "./series";

const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
let n = 0;
const row = (symbol: TickerSymbol, lane: LaneBasis, cadenceSec: number): SeriesRow => ({ seriesId: id(++n), symbol, lane, cadenceSec });
/** The live venue's shape for three stocks and BTC: regular, 24/7 and gap lanes (PLTR has no 24/7 series that trades,
 *  but the series exists on chain — the basket's own lanes keep it out). */
const ALL: SeriesRow[] = [
  ...(["TSLA", "NVDA", "PLTR"] as const).flatMap((s) => [300, 900, 3_600].flatMap((c) => [row(s, "regular", c), row(s, "stock24", c)]).concat(row(s, "gap", 604_800))),
  row("BTC", "crypto24", 300), row("BTC", "crypto24", 900),
];
const label = (ids: string[]) => ids.map((x) => ALL.find((r) => r.seriesId === x)!).map((r) => `${r.symbol}/${r.lane}/${r.cadenceSec}`);

const builders: BasketSpec = { preset: "basket", members: [{ symbol: "TSLA", weightBps: 6_000 }, { symbol: "PLTR", weightBps: 4_000 }], rule: { preset: "momentum", lookback: 6, thresholdBps: 10 }, lanes: "regular" };
const clock: BasketSpec = { preset: "basket", members: [{ symbol: "TSLA", weightBps: 5_000 }, { symbol: "NVDA", weightBps: 5_000 }], rule: { preset: "agent", persona: "Reads.", posture: "balanced", cadences: [3_600] }, lanes: "both" };

describe("strategy-runner series (D-219, D-231)", () => {
  it("a market-hours theme reads every cadence of its members' regular lanes, never 24/7, gap or another stock", () => {
    expect(label(seriesFor(builders, null, ALL))).toEqual(["TSLA/regular/300", "TSLA/regular/900", "TSLA/regular/3600", "PLTR/regular/300", "PLTR/regular/900", "PLTR/regular/3600"]);
  });

  it("an around-the-clock agent theme reads both lanes, on its own cadences only", () => {
    expect(label(seriesFor(clock, null, ALL))).toEqual(["TSLA/regular/3600", "TSLA/stock24/3600", "NVDA/regular/3600", "NVDA/stock24/3600"]);
  });

  it("keeps a scoped strategy on its series and 'any' on crypto 5-minute Windows", () => {
    expect(seriesFor({ preset: "momentum", lookback: 6, thresholdBps: 3 }, id(999), ALL)).toEqual([id(999)]);
    expect(label(seriesFor({ preset: "momentum", lookback: 6, thresholdBps: 3 }, null, ALL))).toEqual(["BTC/crypto24/300"]);
  });

  it("sizes a theme's call by the member behind the Window, 24/7 feed included; other strategies take the whole cap", () => {
    expect(weightOf(builders, "TSLA")).toBe(6_000);
    expect(weightOf(clock, "NVDA-24")).toBe(5_000);
    expect(weightOf(builders, "NVDA")).toBe(0);
    expect(weightOf({ preset: "momentum", lookback: 6, thresholdBps: 3 }, "BTC")).toBeUndefined();
  });
});
