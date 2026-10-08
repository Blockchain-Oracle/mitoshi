import { describe, expect, it } from "vitest";
import { parseAlpacaBars, parseAlpacaSnapshots } from "./alpaca-bars";
import { parseLatestTrades } from "./alpaca-trades";
import { parseBitstampOhlc } from "./bitstamp";
import { aggregate, createChartCandles, parseCoinbaseCandles } from "./chart-candles";
import { createRecentRing } from "./recent-ring";
import type { DisplayFeed, DisplayQuote } from "./types";
import { displayE8 } from "./types";

const KEYS = { keyId: "k", secretKey: "s" };

describe("chart candles (ported from Owarine ecb7565b chart-candles/alpaca-bars tests)", () => {
  it("parses Coinbase rows newest-first into ascending [t, o, h, l, c]", () => {
    const text = JSON.stringify([[120, 9, 12, 10, 11, 5], [60, 8, 11, 9, 10, 4]]);
    expect(parseCoinbaseCandles(text)).toEqual([[60_000, 9, 11, 8, 10], [120_000, 10, 12, 9, 11]]);
  });
  it("aggregates finer candles into aligned buckets", () => {
    const rows: Array<[number, number, number, number, number]> = [[0, 1, 2, 0.5, 1.5], [60_000, 1.5, 3, 1, 2], [120_000, 2, 2.5, 1.8, 2.2], [180_000, 2.2, 2.4, 2, 2.1]];
    expect(aggregate(rows, 180)).toEqual([[0, 1, 3, 0.5, 2.2], [180_000, 2.2, 2.4, 2, 2.1]]);
  });
  it("refuses unknown intervals, unlisted symbols, and a stock with neither Alpaca nor the archive", async () => {
    const read = createChartCandles({ fetchImpl: async () => new Response("[]") });
    expect((await read({ symbol: "BTC", interval: "7m" })).status).toBe(400);
    expect((await read({ symbol: "OPENAI", interval: "1m" })).status).toBe(404);
    expect((await read({ symbol: "TSLA", interval: "1m" })).status).toBe(404);
  });
  it("pages Coinbase for an aggregated interval and names the source", async () => {
    const urls: string[] = [];
    const read = createChartCandles({
      fetchImpl: async (url) => {
        urls.push(String(url));
        const end = Math.floor(Date.parse(new URL(String(url)).searchParams.get("end")!) / 1000);
        return new Response(JSON.stringify(Array.from({ length: 300 }, (_, i) => [end - (i + 1) * 60, 1, 2, 1, 1.5, 1])));
      },
    });
    const r = await read({ symbol: "SOL", interval: "3m", count: 150, endMs: 1_791_000_000_000 });
    expect(r.status).toBe(200);
    expect(urls.length).toBe(2);
    expect(urls[0]).toContain("/products/SOL-USD/candles?granularity=60");
    expect(r.body).toMatchObject({ source: "coinbase" });
    expect((r.body as { candles: unknown[] }).candles.length).toBeGreaterThanOrEqual(149);
  });
  it("falls back to Bitstamp's OHLC when Coinbase can't be reached", async () => {
    const ohlc = { data: { pair: "SOL/USD", ohlc: [{ "timestamp": "1791000000", open: "119.379", high: "119.379", low: "119.364", close: "119.364", volume: "10" }, { "timestamp": "1790999820", open: "119.342", high: "119.379", low: "119.342", close: "119.379", volume: "3" }] } };
    expect(parseBitstampOhlc(JSON.stringify(ohlc))).toEqual([[1_790_999_820_000, 119.342, 119.379, 119.342, 119.379], [1_791_000_000_000, 119.379, 119.379, 119.364, 119.364]]);
    const read = createChartCandles({
      fetchImpl: async (url) => {
        if (String(url).includes("coinbase")) throw new Error("connect ETIMEDOUT");
        expect(String(url)).toContain("/ohlc/solusd/?step=180&limit=2&end=1791000000");
        return new Response(JSON.stringify(ohlc));
      },
    });
    expect(await read({ symbol: "SOL", interval: "3m", count: 2, endMs: 1_791_000_000_000 })).toMatchObject({ status: 200, body: { source: "bitstamp" } });
  });
  it("routes stocks to Alpaca's native timeframe when ops holds keys", async () => {
    const urls: string[] = [];
    const read = createChartCandles({ fetchImpl: async (url) => (urls.push(String(url)), new Response(JSON.stringify({ bars: [{ t: "2026-10-07T14:30:00Z", o: 1, h: 2, l: 0.5, c: 2 }] }))), alpaca: KEYS });
    const r = await read({ symbol: "TSLA", interval: "4h", count: 50, endMs: 1_791_000_000_000 });
    expect(r).toMatchObject({ status: 200, body: { source: "alpaca" } });
    expect(urls[0]).toMatch(/data\.alpaca\.markets\/v2\/stocks\/TSLA\/bars\?timeframe=4Hour&.*limit=50&sort=desc&feed=iex/);
  });
  it("reads Alpaca bars and quotes a stock's day against the previous close", () => {
    const bars = JSON.stringify({ bars: [{ t: "2026-10-07T14:31:00Z", o: 2, h: 3, l: 1.5, c: 2.5 }, { t: "2026-10-07T14:30:00Z", o: 1, h: 2, l: 0.5, c: 2 }] });
    expect(parseAlpacaBars(bars)[0]![0]).toBe(Date.parse("2026-10-07T14:30:00Z"));
    expect(() => parseAlpacaBars(JSON.stringify({ message: "forbidden" }))).toThrow(/forbidden/);
    const day = parseAlpacaSnapshots(JSON.stringify({ TSLA: { dailyBar: { o: 250, h: 262.5, l: 248, c: 260, v: 1200 }, prevDailyBar: { c: 240 } }, NVDA: null }), ["TSLA", "NVDA"]);
    expect(day.TSLA).toEqual({ openE8: "24000000000", highE8: "26250000000", lowE8: "24800000000", volume: "1200", basis: "prev-close", source: "alpaca" });
    expect(day.NVDA).toBeUndefined();
  });
});

describe("Alpaca latest trades", () => {
  it("reads one IEX trade per ticker and skips the missing", () => {
    const text = JSON.stringify({ trades: { TSLA: { t: "2026-10-08T14:30:01.5Z", p: 251.37 }, NVDA: null } });
    expect(parseLatestTrades(text, ["TSLA", "NVDA"])).toEqual([{ symbol: "TSLA", priceE8: 25_137_000_000n, atMs: Date.parse("2026-10-08T14:30:01.5Z"), source: "alpaca" }]);
    expect(() => parseLatestTrades(JSON.stringify({ message: "too many requests" }), ["TSLA"])).toThrow(/too many/);
  });
  it("converts JSON numbers without float noise and refuses non-prices", () => {
    expect(displayE8(0.1 + 0.2)).toBe(30_000_000n);
    expect(displayE8("62000.123456789")).toBe(6_200_012_345_678n);
    expect(displayE8(-1)).toBeNull();
    expect(displayE8("1e5")).toBeNull();
  });
});

describe("the recent ring (ported from Owarine ecb7565b recent-ring.test)", () => {
  it("keeps the last sample per second, oldest first, within the span", () => {
    const ls = new Set<(q: DisplayQuote) => void>();
    const feed: DisplayFeed = { latest: () => null, subscribe: (l) => (ls.add(l), () => ls.delete(l)) };
    const push = (atMs: number, priceE8: bigint) => ls.forEach((l) => l({ symbol: "BTC", priceE8, atMs, source: "coinbase" }));
    const ring = createRecentRing(feed, 10);
    push(1_000, 1n);
    push(1_400, 2n);
    push(2_100, 3n);
    expect(ring.points("BTC")).toEqual([[1_400, "2"], [2_100, "3"]]);
    push(13_000, 4n);
    expect(ring.points("BTC")).toEqual([[13_000, "4"]]);
    expect(ring.points("ETH")).toEqual([]);
    ring.stop();
  });
});
