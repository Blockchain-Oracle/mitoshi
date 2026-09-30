import { describe, expect, it } from "vitest";
import { emptyHaltState, nonNull, observeHalts, redstoneUnreadable, stepHalts, UNREAD, type Observations } from "./decide";

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
    // NVDA stays fresh: some feeds stale while another is current is a real stall (all at once is not, D-186).
    const stale = observeHalts(base({ redstone: { TSLA: { packageSec: NOW - 90, signers: 5 }, BTC: { packageSec: NOW - 90, signers: 5 }, NVDA: fresh } }));
    expect(nonNull(stepHalts(st, stale, true))).toEqual({});
    expect(nonNull(stepHalts(st, stale, true))).toEqual({ TSLA: "redstone-stale", BTC: "redstone-stale", "TSLA-24": "redstone-stale" });
    const night = observeHalts(base({ inRegularHours: false, redstone: { BTC: { packageSec: NOW - 90, signers: 5 }, "TSLA-24": fresh } }));
    expect(nonNull(stepHalts(st, night, false))).toEqual({ BTC: "redstone-stale", "TSLA-24": "redstone-stale" });
    expect(nonNull(stepHalts(emptyHaltState(), observeHalts(base({ exchange: { TSLA: false } })), true))).toEqual({ TSLA: "exchange-halt" });
  });
});

describe("a pass that can't read RedStone is a fetch failure, not a halt (D-186)", () => {
  // 2026-09-29 14:45:41Z: ops' own fetch failed for ≈ 70 s, so every feed's newest package aged past 60 s at once.
  const blind = (over: Partial<Observations> = {}) =>
    base({ redstone: { TSLA: { packageSec: NOW - 65, signers: 5 }, "TSLA-24": { packageSec: NOW - 66, signers: 5 }, BTC: { packageSec: NOW - 65, signers: 5 }, NVDA: { packageSec: NOW - 65, signers: 5 } }, ...over });

  it("our failed fetch (last read > 30 s ago) observes every RedStone asset unread and the board never moves", () => {
    const st = emptyHaltState();
    const o = blind({ redstoneReadSec: NOW - 70 });
    expect(redstoneUnreadable(o)).toBe("fetch-failed");
    expect(nonNull(observeHalts(o))).toEqual({ TSLA: UNREAD, "TSLA-24": UNREAD, BTC: UNREAD, NVDA: UNREAD });
    for (let i = 0; i < 40; i++) expect(nonNull(stepHalts(st, observeHalts(o), true))).toEqual({});
  });

  it("every watched feed stale at once with a fresh read is unread too; the exchange flag still applies", () => {
    const o = blind({ redstoneReadSec: NOW - 5, exchange: { TSLA: true, NVDA: false } });
    expect(redstoneUnreadable(o)).toBe("all-stale");
    const st = emptyHaltState();
    expect(nonNull(stepHalts(st, observeHalts(o), true))).toEqual({ NVDA: "exchange-halt" });
    expect(nonNull(stepHalts(st, observeHalts(o), true))).toEqual({ NVDA: "exchange-halt" });
  });

  it("a real single-feed stall still halts after two passes, with a fresh view", () => {
    const st = emptyHaltState();
    const o = base({ redstoneReadSec: NOW - 5, redstone: { TSLA: { packageSec: NOW - 90, signers: 5 }, "TSLA-24": fresh, BTC: fresh, NVDA: fresh } });
    expect(redstoneUnreadable(o)).toBeNull();
    expect(nonNull(stepHalts(st, observeHalts(o), true))).toEqual({});
    expect(nonNull(stepHalts(st, observeHalts(o), true))).toEqual({ TSLA: "redstone-stale" });
  });

  it("an unread pass holds a confirmed halt and a pending streak alike", () => {
    const st = emptyHaltState();
    const stale = base({ redstoneReadSec: NOW - 5, redstone: { TSLA: { packageSec: NOW - 90, signers: 5 }, "TSLA-24": fresh, BTC: fresh, NVDA: fresh } });
    stepHalts(st, observeHalts(stale), true);
    stepHalts(st, observeHalts(blind({ redstoneReadSec: NOW - 70 })), true);
    expect(nonNull(stepHalts(st, observeHalts(stale), true))).toEqual({ TSLA: "redstone-stale" });
    // Confirmed, then blind for a while: still halted; then a fresh clear needs its own two passes.
    for (let i = 0; i < 5; i++) expect(nonNull(stepHalts(st, observeHalts(blind({ redstoneReadSec: null })), true))).toEqual({ TSLA: "redstone-stale" });
    const clear = base({ redstoneReadSec: NOW - 5 });
    expect(nonNull(stepHalts(st, observeHalts(clear), true))).toEqual({ TSLA: "redstone-stale" });
    expect(nonNull(stepHalts(st, observeHalts(clear), true))).toEqual({});
  });

  it("one watched RedStone feed alone can't be told apart, so it is judged as usual", () => {
    const o = base({ redstoneReadSec: NOW - 5, inRegularHours: false, primary: { BTC: "redstone" }, redstone: { BTC: { packageSec: NOW - 90, signers: 5 } } });
    expect(redstoneUnreadable(o)).toBeNull();
    expect(observeHalts(o).BTC).toBe("redstone-stale");
  });
});
