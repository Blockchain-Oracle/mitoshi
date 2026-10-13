import { describe, expect, it } from "vitest";
import { goTerminalHref, goTradeUrl, goWindowUrl, readGoTarget, readGoTrade } from "./share-link";

const params = (q: string) => {
  const p = new URLSearchParams(q);
  return (name: string) => p.get(name);
};

describe("share-to-sign links (A-3e)", () => {
  it("reads a call link into the terminal's lane, side and stake", () => {
    expect(readGoTrade("btc", "5m", params("side=up&stake=5"), 6)).toEqual({ symbol: "BTC", cadence: "5m", lane: "crypto24", side: "up", stakeBase: 5_000_000n });
    expect(readGoTrade("TSLA", "1h", params("side=down&stake=$2.50"), 6)).toMatchObject({ lane: "stock24", side: "down", stakeBase: 2_500_000n });
  });
  it("drops what it can't trust instead of guessing", () => {
    expect(readGoTrade("DOGE", "5m", params(""), 6)).toBeNull();
    expect(readGoTrade("BTC", "4h", params(""), 6)).toBeNull();
    expect(readGoTrade("BTC", "5m", params("side=sideways&stake=-1"), 6)).toMatchObject({ side: null, stakeBase: null });
    expect(readGoTarget(params("stake=5000"), 6)).toEqual({ side: null, stakeBase: null });
  });
  it("lands on the terminal with the side picked", () => {
    expect(goTerminalHref("BTC", { lane: "crypto24", cadenceSec: 300 }, "up")).toBe("/trade/BTC?lane=crypto24%3A300&pick=up");
    expect(goTerminalHref("ETH", { marketId: "0xabc" }, null)).toBe("/trade/ETH?w=0xabc");
  });
  it("builds the links a post or a share card carries", () => {
    expect(goTradeUrl("https://mitoshi.xyz/", "BTC", "5m", "up", "5")).toBe("https://mitoshi.xyz/go/t/BTC/5m?side=up&stake=5");
    expect(goWindowUrl("https://mitoshi.xyz", "0xABC")).toBe("https://mitoshi.xyz/go/w/0xabc");
  });
});
