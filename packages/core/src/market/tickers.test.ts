// Ported from Agari 03b30ab:packages/core/src/market/tickers.test.ts (Tempo universe)
import { describe, expect, it } from "vitest";
import { laneKey, laneListable, parseLaneKey, REDSTONE_TICKERS, TICKER_SYMBOLS, TICKERS, tickerById } from "./tickers";

describe("ticker registry", () => {
  it("gives every ticker a distinct u16 ticker id (it is part of every Series id)", () => {
    const ids = TICKER_SYMBOLS.map((symbol) => TICKERS[symbol].tickerId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(Number.isInteger(id) && id > 0 && id <= 0xffff).toBe(true);
      expect(tickerById(id)?.tickerId).toBe(id);
    }
  });

  it("is the plan's universe: nine RedStone names, SPCX and BTC/ETH/SOL", () => {
    expect(TICKER_SYMBOLS).toEqual(["TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "AMD", "SPCX", "BTC", "ETH", "SOL"]);
    expect(REDSTONE_TICKERS).not.toContain("SPCX");
    expect(REDSTONE_TICKERS).toHaveLength(12);
  });

  it("keeps stocks off the crypto lane and crypto off the session lanes", () => {
    expect(laneListable("TSLA", "regular")).toBe(true);
    expect(laneListable("TSLA", "crypto24")).toBe(false);
    expect(laneListable("BTC", "crypto24")).toBe(true);
    expect(laneListable("BTC", "gap")).toBe(false);
  });

  it("round-trips lane keys and refuses anything else", () => {
    for (const [symbol, basis, cadence, key] of [
      ["TSLA", "regular", 300, "TSLA-5m"],
      ["TSLA", "gap", 604_800, "TSLA-gap"],
      ["NVDA", "stock24", 900, "NVDA-24-15m"],
      ["BTC", "crypto24", 3_600, "BTC-60m"],
    ] as const) {
      expect(laneKey(symbol, basis, cadence)).toBe(key);
      expect(parseLaneKey(key)).toEqual({ symbol, basis, cadenceSec: cadence });
    }
    expect(parseLaneKey("BTC-gap")).toBeNull();
    expect(parseLaneKey("DOGE-5m")).toBeNull();
    expect(parseLaneKey("TSLA-5s")).toBeNull();
    expect(laneKey("BTC", "regular", 300)).toBe("#BTC-regular-300");
  });
});
