"use client";
/**
 * The hero's Depth view (21st 29968 via `components/ui/depth-chart`): the engine's real book for this Window in UP terms
 * — UP bids below the mid, UP asks above, cumulative contracts — refreshed by the stream on every book event. A lazy
 * island: it loads when the user switches the hero to Depth.
 */
import type { BookDepth, BookLevelView, EventMarket } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, useBookDepth } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import type { BookLevel, OrderBook } from "@/components/ui/chart-engine";
import { DepthChart } from "@/components/ui/depth-chart";
import { DEPTH } from "../copy";
import "@/styles/chart-engine.css";

function cumulative(levels: readonly BookLevelView[], decimals: number): BookLevel[] {
  let total = 0;
  return levels.map((l) => {
    const size = Number(l.quantityRaw) / 10 ** decimals;
    total += size;
    return { price: l.priceBps / 10_000, size, total };
  });
}

export function toOrderBook(depth: BookDepth): OrderBook | null {
  const bids = cumulative([...depth.upBids].sort((a, b) => b.priceBps - a.priceBps), depth.decimals);
  const asks = cumulative([...depth.upAsks].sort((a, b) => a.priceBps - b.priceBps), depth.decimals);
  if (bids.length === 0 && asks.length === 0) return null;
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk)!;
  return { mid, spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : 0, bids, asks };
}

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const size = (s: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(s);

export default function HeroDepth({ market }: { market: Pick<EventMarket, "marketId" | "decimals"> }) {
  const reading = useBookDepth(market, { depth: 20 });
  const queryClient = useQueryClient();
  const book = reading && isOk(reading) ? toOrderBook(reading.value) : null;
  const status = reading === null ? "loading" : !isOk(reading) ? "error" : book === null ? "empty" : "ready";
  return (
    <DepthChart
      book={book}
      status={status}
      labels={DEPTH}
      formatPrice={cents}
      formatSize={size}
      onRetry={() => void queryClient.invalidateQueries({ queryKey: keys.depth(market.marketId) })}
      className="p-2"
    />
  );
}
