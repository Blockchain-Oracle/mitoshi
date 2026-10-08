import { afterEach, describe, expect, it } from "vitest";
import { liveRing, liveTick, mergeRecent, parseTick, recordTick, resetLiveTicks, RING_SPAN_MS } from "./live-ticks";

afterEach(resetLiveTicks);

describe("the live line store", () => {
  it("parses the ops wire and refuses malformed ticks", () => {
    expect(parseTick({ symbol: "BTC", priceE8: "6200000000000", atMs: 1_000, source: "coinbase" })).toEqual({ symbol: "BTC", priceE8: 6_200_000_000_000n, atMs: 1_000, source: "coinbase" });
    expect(parseTick({ symbol: "BTC", priceE8: "-1", atMs: 1_000 })).toBeNull();
    expect(parseTick({ symbol: "BTC", priceE8: "1e9", atMs: 1_000 })).toBeNull();
    expect(parseTick({ symbol: "BTC", priceE8: "0", atMs: 1_000 })).toBeNull();
    expect(parseTick({ symbol: "BTC", priceE8: "100", atMs: 1_000, source: "elsewhere" })?.source).toBe("redstone");
  });

  it("moves only forward in time and keeps half an hour", () => {
    expect(recordTick({ symbol: "BTC", priceE8: 100_00000000n, atMs: 10_000, source: "coinbase" })).toBe(true);
    expect(recordTick({ symbol: "BTC", priceE8: 99_00000000n, atMs: 9_000, source: "coinbase" })).toBe(false);
    expect(recordTick({ symbol: "BTC", priceE8: 100_00000000n, atMs: 10_000, source: "coinbase" })).toBe(false);
    recordTick({ symbol: "BTC", priceE8: 101_00000000n, atMs: 10_000 + RING_SPAN_MS + 1, source: "coinbase" });
    expect(liveRing("BTC")).toEqual({ t: [10_000 + RING_SPAN_MS + 1], p: [101] });
    expect(liveTick("BTC")?.priceE8).toBe(101_00000000n);
  });

  it("seeds the ring from /prices/recent behind what the stream already delivered", () => {
    recordTick({ symbol: "ETH", priceE8: 2_500_00000000n, atMs: 5_000, source: "coinbase" });
    mergeRecent("ETH", [[3_000, "249900000000"], [4_000, "250000000000"], [5_000, "999900000000"]]);
    expect(liveRing("ETH")).toEqual({ t: [3_000, 4_000, 5_000], p: [2_499, 2_500, 2_500] });
    mergeRecent("SOL", [[1_000, "11200000000"]]);
    expect(liveTick("SOL")).toMatchObject({ priceE8: 11_200_000_000n, atMs: 1_000 });
  });
});
