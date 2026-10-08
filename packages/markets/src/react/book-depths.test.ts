import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ok, toMarketId, type BookDepth, type MarketsProvider } from "@cwf/core";
import { keys } from "./keys";
import { readingOf, readingQueryOptions } from "./useReadingQuery";
import { bookDepthQuery } from "./window-reads";

const market = { marketId: toMarketId(`0x${"ab".repeat(32)}`), decimals: 6 };
const depth: BookDepth = {
  upBids: [{ priceRaw: 480_000n, priceBps: 4_800, quantityRaw: 10_000_000n }],
  upAsks: [{ priceRaw: 520_000n, priceBps: 5_200, quantityRaw: 7_000_000n }],
  downBids: [{ priceRaw: 480_000n, priceBps: 4_800, quantityRaw: 7_000_000n }],
  downAsks: [{ priceRaw: 520_000n, priceBps: 5_200, quantityRaw: 10_000_000n }],
  decimals: 6,
};

function portWith(getBookDepth: MarketsProvider["getBookDepth"]): MarketsProvider {
  return { getBookDepth } as unknown as MarketsProvider;
}

describe("bookDepthQuery (D-184): a list's subscription reads what a card's own useBookDepth reads", () => {
  it("is the per-card query: the same key, the same port read at the same depth, the same poll", async () => {
    const getBookDepth = vi.fn(async () => ok(depth, 1));
    const query = bookDepthQuery(portWith(getBookDepth), market, { pollMs: 30_000 });
    expect(query.queryKey).toEqual(keys.depth(market.marketId));
    expect(query.refetchInterval).toBe(30_000);
    expect(query.staleTime).toBe(30_000);
    const reading = await query.queryFn!({} as never);
    expect(getBookDepth).toHaveBeenCalledWith({ marketId: market.marketId, decimals: 6 }, 10);
    expect(reading).toEqual(ok(depth, 1));
  });

  it("shares the cache entry with the per-card read: one fetch answers both, with the same value", async () => {
    const getBookDepth = vi.fn(async () => ok(depth, 1));
    const port = portWith(getBookDepth);
    const client = new QueryClient();
    // What `useBookDepth(market, { pollMs })` subscribes to (usePortReading → useReadingQuery).
    const perCard = readingQueryOptions(keys.depth(market.marketId), () => port.getBookDepth({ marketId: market.marketId, decimals: market.decimals }, 10), { pollMs: 15_000 });
    const fromCard = await client.fetchQuery(perCard);
    const fromList = await client.fetchQuery(bookDepthQuery(port, market, { pollMs: 15_000 }));
    expect(fromList).toBe(fromCard);
    expect(getBookDepth).toHaveBeenCalledTimes(1);
  });

  it("maps a query's state to a Reading as useReadingQuery does", () => {
    expect(readingOf({ data: undefined, isError: false, error: null })).toBeNull();
    expect(readingOf({ data: ok(depth, 1), isError: false, error: null })).toEqual(ok(depth, 1));
    const failed = readingOf({ data: undefined, isError: true, error: new Error("socket closed") });
    expect(failed?.ok).toBe(false);
  });
});
