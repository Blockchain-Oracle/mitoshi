// Ported from Masayume 68f7a09:packages/core/src/surface/structure.test.ts
import { describe, expect, it } from "vitest";
import type { BookDepth, BookLevelView } from "../types/trading";
import { cumulativeDepth, depthBounds } from "./depth";
import { bookStructure, impliedUp } from "./structure";

const D = 6;
const UNIT = 10n ** BigInt(D);
const level = (cents: number, contracts: number): BookLevelView => ({
  priceRaw: BigInt(cents) * (UNIT / 100n),
  priceBps: cents * 100,
  quantityRaw: BigInt(contracts) * UNIT,
});
const mirror = (levels: BookLevelView[]): BookLevelView[] =>
  levels.map((l) => ({ priceRaw: UNIT - l.priceRaw, priceBps: 10_000 - l.priceBps, quantityRaw: l.quantityRaw }));

/** A two-sided UP book: bids 60/58/55, asks 64/66/70 — the DOWN sides are the SDK's mirrors. */
function book(upBids: BookLevelView[], upAsks: BookLevelView[]): BookDepth {
  return { upBids, upAsks, downBids: mirror(upAsks), downAsks: mirror(upBids), decimals: D };
}

const TWO_SIDED = book([level(60, 10), level(58, 20), level(55, 50)], [level(64, 12), level(66, 30), level(70, 40)]);

describe("bookStructure", () => {
  it("reads the mid and the spread off the UP book alone", () => {
    const s = bookStructure(TWO_SIDED);
    expect(s.upAskBps).toBe(6_400);
    expect(s.upBidBps).toBe(6_000);
    expect(s.downAskBps).toBe(4_000);
    expect(s.midBps).toBe(6_200);
    expect(s.spreadBps).toBe(400);
    expect(s.upAskDepthRaw).toBe(82n * UNIT);
    expect(s.upBidDepthRaw).toBe(80n * UNIT);
    expect(s.levels).toBe(6);
    expect(impliedUp(s)).toEqual({ bps: 6_200, basis: "mid" });
  });

  it("has no mid and no spread on a one-sided book, and names the side it does have", () => {
    const asksOnly = bookStructure(book([], [level(64, 12)]));
    expect(asksOnly.midBps).toBeNull();
    expect(asksOnly.spreadBps).toBeNull();
    expect(asksOnly.downAskBps).toBeNull();
    expect(impliedUp(asksOnly)).toEqual({ bps: 6_400, basis: "ask" });

    const bidsOnly = bookStructure(book([level(60, 10)], []));
    expect(impliedUp(bidsOnly)).toEqual({ bps: 6_000, basis: "bid" });
  });

  it("names a crossed book and takes no mid or spread from it", () => {
    // Seen live (context/48): the maker's ladder re-laid mid-Window, bids 87/86/85 over asks 78/79/80.
    const s = bookStructure(book([level(87, 200), level(86, 330), level(85, 460)], [level(78, 200), level(79, 330), level(80, 460)]));
    expect(s.crossed).toBe(true);
    expect(s.midBps).toBeNull();
    expect(s.spreadBps).toBeNull();
    expect(s.upAskBps).toBe(7_800);
    expect(s.upBidBps).toBe(8_700);
    expect(impliedUp(s)).toEqual({ bps: 7_800, basis: "crossed" });
    // Touching — bid equal to ask — is crossed too: there is no width to call a spread.
    expect(bookStructure(book([level(64, 1)], [level(64, 1)])).crossed).toBe(true);
    expect(bookStructure(TWO_SIDED).crossed).toBe(false);
  });

  it("is honest about an empty book", () => {
    const s = bookStructure(book([], []));
    expect(s.upAskBps).toBeNull();
    expect(s.levels).toBe(0);
    expect(impliedUp(s)).toBeNull();
  });
});

describe("cumulativeDepth / depthBounds", () => {
  it("stacks size from the top of the book outward", () => {
    const asks = cumulativeDepth(TWO_SIDED.upAsks);
    expect(asks.map((s) => s.cumulativeRaw)).toEqual([12n * UNIT, 42n * UNIT, 82n * UNIT]);
    const bids = cumulativeDepth(TWO_SIDED.upBids);
    expect(bids.map((s) => s.cumulativeRaw)).toEqual([10n * UNIT, 30n * UNIT, 80n * UNIT]);
    expect(depthBounds(bids, asks)).toEqual({ minBps: 5_400, maxBps: 7_100, maxCumulativeRaw: 82n * UNIT });
  });

  it("clamps the price axis inside the venue's band and returns null with nothing resting", () => {
    expect(depthBounds([], [])).toBeNull();
    const edge = depthBounds(cumulativeDepth([level(1, 1)]), cumulativeDepth([level(99, 1)]));
    expect(edge?.minBps).toBe(0);
    expect(edge?.maxBps).toBe(10_000);
  });
});
