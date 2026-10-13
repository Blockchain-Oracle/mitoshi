import { describe, expect, it } from "vitest";
import { candlesFromTrades, dayChangeBps } from "./feed";

const t = (atSec: number, price: bigint, quote = 1_000_000n) => ({ atSec, priceE18: price, quoteBase: quote });
const MIN = 60_000;

describe("candlesFromTrades", () => {
  it("one trade is one candle with o = h = l = c", () => {
    expect(candlesFromTrades([t(125, 7n)], MIN)).toEqual([{ t: 120_000, o: 7n, h: 7n, l: 7n, c: 7n, v: 1_000_000n }]);
  });

  it("buckets on the interval's edges: [start, start + interval)", () => {
    const c = candlesFromTrades([t(60, 5n), t(119, 9n, 2n), t(120, 4n)], MIN);
    expect(c.map((x) => x.t)).toEqual([60_000, 120_000]);
    expect(c[0]).toMatchObject({ o: 5n, h: 9n, l: 5n, c: 9n, v: 1_000_002n });
  });

  it("never invents a bucket for a gap without trades", () => {
    const c = candlesFromTrades([t(0, 1n), t(600, 2n)], MIN);
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.t)).toEqual([0, 600_000]);
  });

  it("sorts unordered input and tracks high and low inside a bucket", () => {
    const c = candlesFromTrades([t(30, 3n), t(10, 5n), t(20, 1n)], MIN);
    expect(c).toEqual([{ t: 0, o: 5n, h: 5n, l: 1n, c: 3n, v: 3_000_000n }]);
  });
});

describe("dayChangeBps", () => {
  const now = 200_000;
  it("against the last trade a day old", () => {
    expect(dayChangeBps(110n, [t(now - 90_000, 100n), t(now - 86_400, 105n), t(now - 10, 108n)], now)).toEqual({ bps: 476, since: "24h" });
  });
  it("since launch when younger than a day; null without trades", () => {
    expect(dayChangeBps(50n, [t(now - 100, 100n)], now)).toEqual({ bps: -5000, since: "launch" });
    expect(dayChangeBps(50n, [], now)).toBeNull();
  });
});
