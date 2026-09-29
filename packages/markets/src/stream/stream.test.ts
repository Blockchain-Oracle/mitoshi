import { describe, expect, it } from "vitest";
import { createFrameBatcher, streamUrlFor } from "./client";
import { coalesce, opsFor, parseFrame, type CacheOp } from "./dispatch";
import { createSseParser, type SseMessage } from "./sse";

const M = `0x${"ab".repeat(32)}`;
const W = "0x00000000000000000000000000000000000000a1";

describe("SSE framing (D-049)", () => {
  it("parses events across chunk boundaries, with ids, multi-line data, comments and retry", () => {
    const got: SseMessage[] = [];
    let retry = 0;
    const feed = createSseParser((m) => got.push(m), (ms) => (retry = ms));
    feed("retry: 3000\n\n: ping\n\nid: 7\nevent: pri");
    feed('ce\ndata: {"a":\ndata: 1}\n\nevent: Fill\r\ndata: x\r\n\r\n');
    expect(retry).toBe(3000);
    expect(got).toEqual([{ event: "price", data: '{"a":\n1}', id: "7" }, { event: "Fill", data: "x", id: "7" }]);
  });

  it("builds the stream URL with deduplicated topics and the user ticket", () => {
    expect(streamUrlFor("https://ops.x/", ["prices", `market:${M}`, "prices"], "t.1.f")).toBe(`https://ops.x/v1/stream?topics=prices%2Cmarket%3A${M}&ticket=t.1.f`);
  });
});

describe("stream → query cache", () => {
  it("writes a price tick into its stream-owned key", () => {
    const ops = opsFor("price", parseFrame(JSON.stringify({ topic: "prices", data: { symbol: "TSLA-24", priceE8: "35906056763", publishTimeSec: 10, source: "redstone", signers: 5 } }))!);
    expect(ops).toEqual([{ kind: "set", key: ["cwf", "price", "TSLA-24"], value: { asset: "TSLA-24", priceRaw: 35_906_056_763n, emaRaw: 35_906_056_763n, decimals: 8, blockTimestampSec: 10 } }]);
  });

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
    expect(parseFrame("not json")).toBeNull();
  });

  it("coalesces a frame: the last set per key wins, each invalidation once, and applies once per frame", () => {
    const set = (v: number): CacheOp => ({ kind: "set", key: ["cwf", "price", "BTC"], value: v });
    const inv: CacheOp = { kind: "invalidate", key: ["cwf", "onchain", M] };
    expect(coalesce([set(1), inv, set(2), inv])).toEqual([set(2), inv]);
    const applied: CacheOp[][] = [];
    const frames: (() => void)[] = [];
    const push = createFrameBatcher((ops) => applied.push(ops), (flush) => frames.push(flush));
    push([set(1)]);
    push([set(2), inv]);
    push([inv]);
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(applied).toEqual([[set(2), inv]]);
  });
});
