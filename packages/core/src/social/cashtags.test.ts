import { describe, expect, it } from "vitest";
import { captionParts, parseCashtags } from "./cashtags";

describe("cashtags", () => {
  it("files a take under its asset, then registry tickers in the caption, at most four", () => {
    expect(parseCashtags("$NVDA and $AAPL follow $TSLA, not $NFLX or $TSLAx", "TSLA")).toEqual(["TSLA", "NVDA", "AAPL"]);
    expect(parseCashtags("$AAPL $MSFT $META $GOOGL $AMZN", "BTC")).toEqual(["BTC", "AAPL", "MSFT", "META"]);
  });
  it("cuts a caption into plain runs and links", () => {
    expect(captionParts("UP on $TSLA, $NFLX too")).toEqual([{ text: "UP on " }, { text: "$TSLA", symbol: "TSLA" }, { text: ", $NFLX too" }]);
  });
});
