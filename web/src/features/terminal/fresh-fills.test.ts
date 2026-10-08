import type { EventMarket, MarketId } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { FRESH_MS, withFreshFills, type FreshFill } from "./fresh-fills";
import type { TerminalPosition } from "./terminal-positions";

const M = `0x${"ab".repeat(32)}` as MarketId;
const market = { marketId: M, asset: "BTC", intervalSec: 300, expirySec: 2_000, decimals: 6 } as unknown as EventMarket;
const fill: FreshFill = { marketId: M, side: "up", via: "wallet", contractsRaw: 1_700_000n, costBase: 970_000n, atMs: 1_000 };
const fetchedUp = { id: `w:${M}`, via: "wallet", entryKey: M, marketId: M, asset: "BTC", intervalSec: 300, expirySec: 2_000, side: "up", heldRaw: 1_700_000n, costBase: 970_000n, decimals: 6, entrySpot: 80_000, trailStop: null, tpBase: null, slBase: null, openedAtMs: 1_000 } as TerminalPosition;

describe("a fresh fill shows at once (S23 gate)", () => {
  it("shows the booked fill as a position while the fetched list hasn't caught up", () => {
    const out = withFreshFills([], [fill], () => market, 2_000);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: `w:${M}`, asset: "BTC", side: "up", heldRaw: 1_700_000n, costBase: 970_000n });
  });
  it("lets the fetched position take over once it's there, in the same home", () => {
    expect(withFreshFills([fetchedUp], [fill], () => market, 2_000)).toEqual([fetchedUp]);
    expect(withFreshFills([fetchedUp], [{ ...fill, via: "vault" }], () => market, 2_000)).toHaveLength(2);
  });
  it("drops a stale fill and one on a Window the screen doesn't know", () => {
    expect(withFreshFills([], [fill], () => market, 1_000 + FRESH_MS)).toEqual([]);
    expect(withFreshFills([], [fill], () => null, 2_000)).toEqual([]);
  });
});
