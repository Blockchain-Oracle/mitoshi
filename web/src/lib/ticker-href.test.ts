import { describe, expect, it } from "vitest";
import { tickerHref, tickerHubRoute } from "./ticker-href";

describe("a ticker's hub address", () => {
  it("opens every listed ticker's hub, coins included, and the chart otherwise", () => {
    expect(tickerHref("tsla")).toBe("/tickers/TSLA");
    expect(tickerHref("BTC")).toBe("/tickers/BTC");
    expect(tickerHref("xyz")).toBe("/trade/XYZ");
  });
  it("normalises a listed symbol, 404s an unlisted one, and leaves other paths alone", () => {
    expect(tickerHubRoute("/tickers/BTC")).toBeNull();
    expect(tickerHubRoute("/tickers/btc")).toEqual({ redirect: "/tickers/BTC" });
    expect(tickerHubRoute("/tickers/Tsla/")).toEqual({ redirect: "/tickers/TSLA" });
    expect(tickerHubRoute("/tickers/NOPE")).toBe("missing");
    expect(tickerHubRoute("/tickers")).toBeNull();
    expect(tickerHubRoute("/trade/btc")).toBeNull();
  });
});
