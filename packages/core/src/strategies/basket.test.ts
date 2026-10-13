import { describe, expect, it } from "vitest";
import type { LaneBasis } from "../types/market";
import { basketEligible, basketStakeBase, basketStocks, basketTrades, basketWeights } from "./basket";
import vectors from "./basket.vectors.json";
import { ruleCallWhy } from "./calls";
import { describeSpec, encodeSpec, encodeStrategyMetadata, isBasket, isSpec, parseStrategyMetadata } from "./spec";
import type { BasketSpec } from "./types";

const themes = vectors.themes.map((t) => ({ ...t, spec: t.spec as BasketSpec }));

describe("basket spec (D-231)", () => {
  it.each(themes)("$name: encodes, describes and parses back", (t) => {
    expect(isSpec(t.spec)).toBe(true);
    expect(isBasket(t.spec)).toBe(true);
    expect(encodeSpec(t.spec)).toBe(t.encoded);
    expect(describeSpec(t.spec)).toBe(t.describe);
    const meta = parseStrategyMetadata(encodeStrategyMetadata({ name: t.name, description: "", spec: t.spec }));
    expect(meta?.spec).toEqual(t.spec);
  });

  it.each(vectors.refused)("refuses: $why", (r) => {
    expect(isSpec(r.spec)).toBe(false);
    expect(parseStrategyMetadata(JSON.stringify({ name: "x", description: "", spec: r.spec }))).toBeNull();
  });

  it("leaves the other presets' bytes where they were", () => {
    expect(encodeSpec({ preset: "momentum", lookback: 6, thresholdBps: 20 })).toBe('{"p":"momentum","lb":6,"th":20}');
    expect(encodeSpec({ preset: "agent", persona: "Reads.", posture: "guarded", cadences: [300] })).toBe('{"p":"agent","persona":"Reads.","po":"guarded","c":[300]}');
    expect(encodeSpec({ preset: "mirror", trader: "0x00000000000000000000000000000000000000A1", withinSec: 120 })).toBe('{"p":"mirror","t":"0x00000000000000000000000000000000000000a1","w":120}');
  });

  it.each(vectors.stakes)("sizes a $weightBps bps call of a $capBase cap at $stakeBase", (s) => {
    expect(basketStakeBase(BigInt(s.capBase), s.weightBps)).toBe(BigInt(s.stakeBase));
  });

  it.each(vectors.trades)("theme $theme trades $series.symbol $series.lane $series.cadenceSec: $trades", (v) => {
    expect(basketTrades(themes[v.theme]!.spec, { symbol: v.series.symbol, lane: v.series.lane as LaneBasis, cadenceSec: v.series.cadenceSec })).toBe(v.trades);
  });

  it("lists the stocks a basket may hold on each lane", () => {
    expect(basketStocks("regular")).toEqual(["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "AMD"]);
    expect(basketStocks("both")).toEqual(["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN"]);
    expect(basketStocks("stock24")).toEqual(basketStocks("both"));
    expect(basketEligible("SPCX", "regular")).toBe(false);
  });

  it("splits shares into weights that sum to exactly 100%", () => {
    expect(basketWeights([1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(basketWeights([3, 2])).toEqual([6000, 4000]);
    expect(basketWeights([0, 0])).toEqual([0, 0]);
  });

  it("words a member's call with the basket's own rule", () => {
    expect(ruleCallWhy(themes[0]!.spec, "TSLA", "up", 14)).toBe("TSLA rose 0.14% from its opening print; it bets the move runs on.");
    expect(ruleCallWhy(themes[1]!.spec, "AMD", "up", -20)).toBe("AMD fell 0.2% from its opening print; it bets on a pullback.");
    expect(ruleCallWhy(themes[2]!.spec, "NVDA", "down", null)).toBe("It called DOWN.");
  });
});
