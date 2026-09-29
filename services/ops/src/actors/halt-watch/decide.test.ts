import { describe, expect, it } from "vitest";
import { emptyHaltState, nonNull, observeHalts, stepHalts, type Observations } from "./decide";

const NOW = 1_800_000_000;
const fresh = { packageSec: NOW - 5, signers: 5 };
const base = (over: Partial<Observations> = {}): Observations => ({
  nowSec: NOW, inRegularHours: true,
  primary: { TSLA: "redstone", "TSLA-24": "redstone", BTC: "redstone", NVDA: "redstone" },
  redstone: { TSLA: fresh, "TSLA-24": fresh, BTC: fresh, NVDA: fresh }, datastreams: {}, exchange: { TSLA: true, NVDA: true }, ...over,
});

describe("halt-watch rules", () => {
  it("names stale, short-signed and exchange halts; a source-less lane is paused, not halted", () => {
    const o = observeHalts(base({ redstone: { TSLA: { packageSec: NOW - 90, signers: 5 }, "TSLA-24": { packageSec: NOW - 5, signers: 2 }, BTC: fresh }, exchange: { NVDA: false } }));
    expect(nonNull(o)).toEqual({ TSLA: "redstone-stale", "TSLA-24": "redstone-signers", NVDA: "exchange-halt" });
    expect(o.AAPL).toBeNull();
  });

  it("confirms after two passes (the exchange flag at once) and clears session assets out of hours", () => {
    const st = emptyHaltState();
    const stale = observeHalts(base({ redstone: { TSLA: { packageSec: NOW - 90, signers: 5 }, BTC: { packageSec: NOW - 90, signers: 5 } } }));
    expect(nonNull(stepHalts(st, stale, true))).toEqual({});
    expect(nonNull(stepHalts(st, stale, true))).toEqual({ TSLA: "redstone-stale", BTC: "redstone-stale", "TSLA-24": "redstone-stale", NVDA: "redstone-stale" });
    const night = observeHalts(base({ inRegularHours: false, redstone: { BTC: { packageSec: NOW - 90, signers: 5 } } }));
    expect(nonNull(stepHalts(st, night, false))).toEqual({ BTC: "redstone-stale", "TSLA-24": "redstone-stale" });
    expect(nonNull(stepHalts(emptyHaltState(), observeHalts(base({ exchange: { TSLA: false } })), true))).toEqual({ TSLA: "exchange-halt" });
  });
});
