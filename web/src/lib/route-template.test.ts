import { describe, expect, it } from "vitest";
import { routeTemplate } from "./route-template";

describe("routeTemplate", () => {
  it("collapses ids, addresses and symbols into their route params", () => {
    expect(routeTemplate("/markets/0xabc123")).toBe("/markets/[id]");
    expect(routeTemplate("/tickers/TSLA")).toBe("/tickers/[symbol]");
    expect(routeTemplate("/u/0x00000000000000000000000000000000000000a1")).toBe("/u/[address]");
    expect(routeTemplate("/games/duel/m-123")).toBe("/games/duel/[matchId]");
    expect(routeTemplate("/themes/create")).toBe("/themes/create");
    expect(routeTemplate("/launch/stablecoin")).toBe("/launch/stablecoin");
    expect(routeTemplate("/")).toBe("/");
    expect(routeTemplate("/markets?x=1")).toBe("/markets");
  });
});
