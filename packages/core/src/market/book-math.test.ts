// Ported from Agari 03b30ab:packages/core/src/market/book-math.test.ts
import { describe, expect, it } from "vitest";
// Vectors: Agari 03b30ab:anchor/tests/vectors/book.vectors.json (slots); S2.8 regenerates them in seconds for EngineLens.
import vectors from "./book.vectors.json";
import { bookLevels, exitWalk, outcomeLevels, quoteStake, topOfBook, vwapOverDepth, type BookLevel, type BookSideView, type NodeFilter, type TakerKind } from "./book-math";

interface VectorOrder {
  price: number;
  lots: string;
  expireTs: string;
  placedSlot: string;
  live: boolean;
}

/** The vectors' layout rule (also in `agari-common::book_walk` tests): nodes in reverse list order, FIFO = list order. */
function buildSide(orders: readonly VectorOrder[]): BookSideView {
  const nodes: { lots: bigint; expireTs: bigint; placedSlot: bigint; live: boolean; next: number }[] = new Array(orders.length);
  const heads = new Array<number>(1000).fill(0);
  const tails = new Array<number>(1000).fill(0);
  const bits = new Array<bigint>(16).fill(0n);
  orders.forEach((o, k) => {
    const index = orders.length - 1 - k;
    nodes[index] = { lots: BigInt(o.lots), expireTs: BigInt(o.expireTs), placedSlot: BigInt(o.placedSlot), live: o.live, next: 0 };
    if (heads[o.price] === 0) heads[o.price] = index + 1;
    else nodes[tails[o.price]! - 1]!.next = index + 1;
    tails[o.price] = index + 1;
    bits[Math.floor(o.price / 64)] = bits[Math.floor(o.price / 64)]! | (1n << BigInt(o.price % 64));
  });
  return { bits, heads, nodes };
}

const wire = (levels: readonly BookLevel[]) => levels.map(([p, q]) => [p, String(q)]);

describe("book walks match the shared vectors", () => {
  it.each(vectors.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const bids = buildSide(c.bids);
    const asks = buildSide(c.asks);
    const f: NodeFilter = { now: BigInt(c.filter.now), slot: BigInt(c.filter.slot), restedOnly: c.filter.restedOnly, minRestSlots: BigInt(c.filter.minRestSlots) };
    const e = c.expect;
    expect(wire(bookLevels(bids, "bid", c.n, f))).toEqual(e.bidLevels);
    expect(wire(bookLevels(asks, "ask", c.n, f))).toEqual(e.askLevels);
    const top = topOfBook(bids, asks, f);
    expect({ bid: top.bid && wire([top.bid])[0], ask: top.ask && wire([top.ask])[0] }).toEqual(e.top);
    for (const kind of ["BUY_YES", "SELL_YES", "BUY_NO", "SELL_NO"] as const) {
      expect(wire(outcomeLevels(kind, bids, asks, c.n, f))).toEqual(e.outcome[kind]);
    }
    for (const v of e.vwap) {
      const r = vwapOverDepth(outcomeLevels(v.kind as TakerKind, bids, asks, 32, f), BigInt(v.lots));
      expect([String(r.vwapTicks), String(r.filled)]).toEqual([v.vwapTicks, v.filled]);
    }
    for (const x of e.exit) {
      const r = exitWalk(outcomeLevels(x.kind as TakerKind, bids, asks, 32, f), BigInt(x.lots));
      expect([String(r.proceeds), String(r.filled)]).toEqual([x.proceeds, x.filled]);
    }
    for (const q of e.quotes) {
      const side = q.side as "BUY_YES" | "BUY_NO";
      const r = quoteStake(outcomeLevels(side, bids, asks, 32, f), side, BigInt(q.stake), BigInt(q.cu), BigInt(q.minLots), q.slippageBps, q.minTicks);
      expect(r && { limitTicks: r.limitTicks, yesPriceTicks: r.yesPriceTicks, lots: String(r.lots), escrowCash: String(r.escrowCash) }).toEqual(q.result);
    }
  });
});
