// Ported from Owarine ecb7565b:services/ops/src/prices/crypto-rest.test.ts (+ SOL on every venue).
import { describe, expect, it } from "vitest";
import type { Fetch } from "./types";
import { medianTrade, readCryptoMedian, readVenue, type VenueTrade } from "./crypto-rest";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

/** Each venue's real response shape (trimmed) for BTC 62,000-ish and ETH 2,500-ish. */
function venues(down: readonly string[] = []): Fetch {
  return (async (url: string) => {
    const host = new URL(url).host;
    if (down.some((d) => host.includes(d))) throw new Error(`connect ETIMEDOUT ${host}`);
    if (host.includes("coinbase")) return ok({ price: url.includes("BTC") ? "62010.10" : "2501.00", time: "2026-10-08T11:59:59.500Z" });
    if (host.includes("bitstamp")) return ok({ last: url.includes("btc") ? "62000" : "2500.50", "timestamp": String(NOW / 1000 - 2) });
    if (host.includes("bitfinex")) return ok([["tBTCUSD", 1, 1, 1, 1, 0, 0, 62005, 1, 1, 1], ["tETHUSD", 1, 1, 1, 1, 0, 0, 2499.9, 1, 1, 1], ["tSOLUSD", 1, 1, 1, 1, 0, 0, 151.25, 1, 1, 1]]);
    if (host.includes("kraken")) return ok({ error: [], result: { XXBTZUSD: { c: ["62020.0", "0.1"] }, XETHZUSD: { c: ["2502.0", "1"] }, SOLUSD: { c: ["151.3", "2"] } } });
    if (host.includes("gemini")) return ok({ last: url.includes("btc") ? "61990" : "2500", volume: { "timestamp": NOW - 1_000 } });
    throw new Error(`unexpected ${url}`);
  }) as unknown as Fetch;
}

describe("crypto spot REST fallback across five venues", () => {
  it("reads each venue's own response shape", async () => {
    const f = venues();
    expect((await readVenue("bitfinex", ["BTC", "ETH"], f, NOW)).get("ETH")?.priceE8).toBe(249_990_000_000n);
    expect((await readVenue("kraken", ["BTC"], f, NOW)).get("BTC")?.priceE8).toBe(6_202_000_000_000n);
    expect((await readVenue("gemini", ["BTC"], f, NOW)).get("BTC")?.timeMs).toBe(NOW - 1_000);
    expect((await readVenue("bitfinex", ["SOL"], f, NOW)).get("SOL")?.priceE8).toBe(15_125_000_000n);
    expect((await readVenue("kraken", ["SOL"], f, NOW)).get("SOL")?.priceE8).toBe(15_130_000_000n);
  });

  it("publishes the median, so one venue's odd print moves nothing", async () => {
    const r = await readCryptoMedian(["BTC", "ETH"], venues(), NOW);
    // 61,990 · 62,000 · 62,005 · 62,010.10 · 62,020 → 62,005
    expect(r.bySymbol.get("BTC")).toEqual({ trade: expect.objectContaining({ venue: "bitfinex", priceE8: 6_200_500_000_000n }), venues: 5 });
    expect(r.failed).toEqual([]);
  });

  it("keeps a spot when Coinbase and Kraken are unreachable (the 7–8 Oct hotspot)", async () => {
    const r = await readCryptoMedian(["BTC"], venues(["coinbase", "kraken"]), NOW);
    expect(r.failed.sort()).toEqual(["coinbase", "kraken"]);
    expect(r.bySymbol.get("BTC")?.venues).toBe(3);
    expect(r.bySymbol.get("BTC")?.trade.priceE8).toBe(6_200_000_000_000n);
  });

  it("answers nothing, and never throws, when every venue is down", async () => {
    const r = await readCryptoMedian(["BTC"], venues(["coinbase", "bitstamp", "bitfinex", "kraken", "gemini"]), NOW);
    expect(r.bySymbol.size).toBe(0);
    expect(r.failed).toHaveLength(5);
  });

  it("ignores trades older than a minute and takes the lower middle of an even count", () => {
    const t = (priceE8: bigint, ageMs: number): VenueTrade => ({ venue: "bitstamp", priceE8, timeMs: NOW - ageMs });
    expect(medianTrade([t(10n, 0), t(20n, 0), t(30n, 0), t(40n, 0)], NOW)?.priceE8).toBe(20n);
    expect(medianTrade([t(10n, 120_000), t(30n, 0)], NOW)?.priceE8).toBe(30n);
    expect(medianTrade([t(10n, 120_000)], NOW)).toBeNull();
  });
});
