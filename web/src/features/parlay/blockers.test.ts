import { diagnosis, type EventMarket } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { parlayBlocker, type ParlayBlockInput } from "./blockers";
import type { LegWindow } from "./data";

let n = 0;
const win = (asset: string, intervalSec = 300, priced = true): LegWindow =>
  ({ market: { marketId: `0x${(++n).toString(16).padStart(64, "0")}`, asset, lane: "crypto24", intervalSec }, model: priced ? {} : null }) as unknown as LegWindow;
const leg = (w: LegWindow, key: string) => ({ key, marketId: w.market.marketId, laneKey: `${w.market.asset}|${w.market.lane}|${w.market.intervalSec}` });

const btc = win("BTC");
const btcNext = win("BTC");
const eth = win("ETH");
const sol = win("SOL");

const base = (over: Partial<ParlayBlockInput> = {}): ParlayBlockInput => ({
  paused: false,
  legs: [leg(btc, "a"), leg(eth, "b")],
  amountZero: false,
  error: null,
  thinLeg: null,
  quote: "ready",
  capacity: null,
  spotsDown: false,
  underFairLeg: null,
  legProbBps: [5_000, 4_000],
  fitText: null,
  funding: "ready",
  overBalance: null,
  windows: [btc, eth, btcNext, sol],
  ...over,
});

describe("parlayBlocker", () => {
  it("asks for a second leg", () => {
    expect(parlayBlocker(base({ legs: [leg(btc, "a")] }))).toMatchObject({ label: "Add a second leg", fix: { kind: "add-leg" } });
  });
  it("swaps a thin leg to the next Window in its own lane", () => {
    const b = parlayBlocker(base({ thinLeg: 0 }));
    expect(b).toMatchObject({ label: "Swap leg 1 →", caption: "Leg 1's book is too thin" });
    expect(b?.fix).toMatchObject({ kind: "swap-leg", key: "a", window: { market: { marketId: btcNext.market.marketId } } });
  });
  it("drops a leg with no lane successor while two legs remain, else moves it to another asset", () => {
    const three = [leg(btc, "a"), leg(eth, "b"), leg(sol, "c")];
    expect(parlayBlocker(base({ legs: three, thinLeg: 1, windows: [btc, eth, sol] }))?.fix).toEqual({ kind: "drop-leg", key: "b" });
    const two = parlayBlocker(base({ thinLeg: 1, windows: [btc, eth, sol] }));
    expect(two?.label).toBe("Swap leg 2 →");
    expect(two?.fix).toMatchObject({ kind: "swap-leg", key: "b", window: { market: { asset: "SOL" } } });
  });
  it("drops the least likely leg of a long shot", () => {
    const error = { ...diagnosis("outside-band", "LongShot"), errorName: "LongShot" };
    expect(parlayBlocker(base({ error, quote: "waiting" }))).toMatchObject({ label: "Drop the longest leg", fix: { kind: "drop-leg", key: "b" } });
  });
  it("names the pricing wait, then Retry when late", () => {
    expect(parlayBlocker(base({ quote: "waiting" }))).toMatchObject({ wait: true, label: "Pricing" });
    expect(parlayBlocker(base({ quote: "late" }))).toMatchObject({ label: "Retry", caption: "Quote is late" });
  });
  it("is null when the slip can be placed", () => {
    expect(parlayBlocker(base())).toBeNull();
  });
});
