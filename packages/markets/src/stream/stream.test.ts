import { describe, expect, it } from "vitest";
import { coalesce, opsFor, parseFrame, type CacheOp } from "./dispatch";

const M = `0x${"ab".repeat(32)}`;
const W = "0x00000000000000000000000000000000000000a1";

describe("stream → query cache", () => {
  it("a fill on a Window marks its snapshot, depth and row stale; a verdict also the lanes and every verdict/claimables", () => {
    expect(opsFor("Fill", { topic: `market:${M}`, data: { market: M, lots: "1" } }).map((o) => o.key)).toEqual([["cwf", "onchain", M], ["cwf", "depth", M], ["cwf", "market", M]]);
    const resolved = opsFor("WindowResolved", { topic: "verdicts", data: { market: M } }).map((o) => o.key);
    expect(resolved).toContainEqual(["cwf", "lanes"]);
    expect(resolved).toContainEqual(["cwf", "verdict"]);
    expect(resolved).toContainEqual(["cwf", "claimables"]);
  });

  it("the user's own event refreshes that wallet's money reads and its verdict on the Window", () => {
    const keys = opsFor("Redeemed", { topic: `user:${W}`, data: { market: M, holder: W } }).map((o) => o.key);
    expect(keys).toEqual([["cwf", "balanceSheet", W], ["cwf", "positions", W], ["cwf", "claimables", W], ["cwf", "history", W], ["cwf", "verdict", W, M]]);
    expect(opsFor("halts", { topic: "halts", data: {} })).toEqual([]);
    expect(opsFor("price", { topic: "prices", data: { symbol: "BTC", priceE8: "1" } })).toEqual([]);
    expect(parseFrame("not json")).toBeNull();
  });

  it("coalesces a frame: the last set per key wins, each invalidation once", () => {
    const set = (v: number): CacheOp => ({ kind: "set", key: ["cwf", "price", "BTC"], value: v });
    const inv: CacheOp = { kind: "invalidate", key: ["cwf", "onchain", M] };
    expect(coalesce([set(1), inv, set(2), inv])).toEqual([set(2), inv]);
  });
});
