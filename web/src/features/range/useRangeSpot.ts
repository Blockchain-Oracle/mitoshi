"use client";
/**
 * The live price a Range or Moonshot ticket reads (R4-5 review, D-227; moved out of RangeTicketBody so Moonshot reads
 * the same one): the stream's, or when the stream has none (between ticks, or no ops stream) the signed RedStone
 * median the open's own proof comes from — the same real price, never a placeholder. Both tickets test the book's
 * drift against it (`useRangeDrift`), so a stale book is named before the hold, not refused after the passkey.
 */
import type { EventMarket } from "@cwf/core";
import { useAssetPrice } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { feedKeyOf } from "../markets/units";
import { fetchSpots } from "../parlay/useParlayQuote";

const SIGNED_REFRESH_MS = 15_000;

/** The live price × 1e8, or null until one is known. */
export function useRangeSpot(market: EventMarket, feed: string | null, nowMs: number): bigint | null {
  const price = useAssetPrice(feedKeyOf(market), nowMs);
  const live = price?.ok && price.value ? price.value.priceRaw : null;
  const signed = useQuery({
    queryKey: ["cwf", "range", "spot", feed ?? ""],
    queryFn: async () => (await fetchSpots([feed!])).get(feed!)!.medianE8,
    enabled: feed !== null && live === null,
    refetchInterval: SIGNED_REFRESH_MS,
  });
  return live ?? signed.data ?? null;
}
