import { describe, expect, it } from "vitest";
import type { SessionState, TickerSymbol } from "@cwf/core";
import type { SpotFeed, SpotQuote, SpotSymbol } from "../prices/spot";
import { createDisplayFeed, FAST_STALE_MS, redstoneKeyFor } from "./feed";
import type { DisplayFeedHandle, DisplayQuote } from "./types";

function fakeFast(): DisplayFeedHandle & { push(q: DisplayQuote): void } {
  const ls = new Set<(q: DisplayQuote) => void>();
  return { start: () => undefined, stop: () => undefined, latest: () => null, subscribe: (l) => (ls.add(l), () => ls.delete(l)), push: (q) => ls.forEach((l) => l(q)) };
}

function fakeSpot(seed: SpotQuote[] = []): SpotFeed & { push(q: SpotQuote): void } {
  const ls = new Set<(q: SpotQuote) => void>();
  const newest = new Map<string, SpotQuote>(seed.map((q) => [q.symbol, q]));
  return {
    latest: (s) => newest.get(s) ?? null,
    newest: (s) => newest.get(s) ?? null,
    at: () => null,
    subscribe: (l) => (ls.add(l), () => ls.delete(l)),
    symbols: () => [...newest.keys()] as SpotSymbol[],
    lastReadSec: () => null,
    push(q) {
      newest.set(q.symbol, q);
      ls.forEach((l) => l(q));
    },
  };
}

const signed = (symbol: SpotSymbol, priceE8: bigint, publishTimeSec: number): SpotQuote => ({ symbol, priceE8, publishTimeSec, signers: 3, source: "redstone" });
const fast = (symbol: TickerSymbol, priceE8: bigint, atMs: number, source: DisplayQuote["source"] = "coinbase"): DisplayQuote => ({ symbol, priceE8, atMs, source });

describe("the display feed", () => {
  it("prefers the fast source and hands the line to RedStone after it has been quiet", () => {
    let now = 1_000_000;
    const crypto = fakeFast();
    const spot = fakeSpot();
    const feed = createDisplayFeed({ crypto, stocks: null, spot, sessionState: () => "regular", nowMs: () => now });
    const seen: DisplayQuote[] = [];
    feed.subscribe((q) => seen.push(q));
    feed.start();
    crypto.push(fast("BTC", 62_000n, now));
    spot.push(signed("BTC", 61_990n, now / 1000));
    expect(feed.latest("BTC")?.source).toBe("coinbase");
    now += FAST_STALE_MS + 1;
    spot.push(signed("BTC", 61_995n, now / 1000));
    expect(feed.latest("BTC")).toMatchObject({ source: "redstone", priceE8: 61_995n });
    expect(seen.map((q) => q.source)).toEqual(["coinbase", "redstone"]);
  });

  it("seeds every ticker from the newest signed values and never moves backwards in time", () => {
    const spot = fakeSpot([signed("ETH", 2_500n, 100)]);
    const crypto = fakeFast();
    const feed = createDisplayFeed({ crypto, stocks: null, spot, sessionState: () => null, nowMs: () => 200_000 });
    feed.start();
    expect(feed.latest("ETH")).toMatchObject({ priceE8: 2_500n, atMs: 100_000, source: "redstone" });
    crypto.push(fast("ETH", 2_400n, 90_000));
    expect(feed.latest("ETH")?.priceE8).toBe(2_500n);
  });

  it("draws a stock from its 24/7 feed outside regular hours, and PLTR from its regular close", () => {
    const has24 = (key: string) => key !== "PLTR-24";
    const at = (state: SessionState | null) => [redstoneKeyFor("TSLA", state, has24), redstoneKeyFor("PLTR", state, has24)];
    expect(at("regular")).toEqual(["TSLA", "PLTR"]);
    expect(at("post")).toEqual(["TSLA-24", "PLTR"]);
    expect(at("closed")).toEqual(["TSLA-24", "PLTR"]);
    const spot = fakeSpot([signed("TSLA", 25_000n, 10), signed("TSLA-24", 25_100n, 10)]);
    const feed = createDisplayFeed({ crypto: fakeFast(), stocks: null, spot, sessionState: () => "closed", nowMs: () => 20_000 });
    feed.start();
    expect(feed.latest("TSLA")?.priceE8).toBe(25_100n);
  });
});
