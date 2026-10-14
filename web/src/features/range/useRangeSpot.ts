"use client";
/**
 * The live price a Range or Moonshot ticket reads (R4-5 review, D-227; moved out of RangeTicketBody so Moonshot reads
 * the same one): the stream's, or when the stream has none (between ticks, or no ops stream) the signed RedStone
 * median the open's own proof comes from — the same real price, never a placeholder. Both tickets test the book's
 * drift against it (`useRangeDrift`), so a stale book is named before the hold, not refused after the passkey.
 * R6 games §4.3.4 (T17): the wait is named and timed — `late` 10 s after the price went missing, or as soon as the
 * signed read fails — and `retry` asks again and restarts the clock.
 */
import type { EventMarket } from "@cwf/core";
import { useAssetPrice } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { feedKeyOf } from "../markets/units";
import { fetchSpots } from "../parlay/useParlayQuote";

const SIGNED_REFRESH_MS = 15_000;
export const SPOT_LATE_MS = 10_000;

export interface RangeSpot {
  /** The live price × 1e8, or null until one is known. */
  spotE8: bigint | null;
  /** When the price went missing (client clock), null while there is one. */
  waitingSinceMs: number | null;
  /** The signed read failed with no live price to stand in. */
  failed: boolean;
  late: boolean;
  retry: () => void;
}

export function useRangeSpot(market: EventMarket, feed: string | null, nowMs: number): RangeSpot {
  const price = useAssetPrice(feedKeyOf(market), nowMs);
  const live = price?.ok && price.value ? price.value.priceRaw : null;
  const signed = useQuery({
    queryKey: ["cwf", "range", "spot", feed ?? ""],
    queryFn: async () => (await fetchSpots([feed!])).get(feed!)!.medianE8,
    enabled: feed !== null && live === null,
    refetchInterval: SIGNED_REFRESH_MS,
  });
  const spotE8 = live ?? signed.data ?? null;
  const missing = spotE8 === null;
  const [since, setSince] = useState<number | null>(null);
  // The clock starts after mount (a prerender never reads it) and stops the moment a price is known.
  useEffect(() => setSince((s) => (missing ? (s ?? Date.now()) : null)), [missing]);
  const failed = missing && signed.isError;
  return {
    spotE8,
    waitingSinceMs: since,
    failed,
    late: missing && (failed || (since !== null && nowMs > 0 && nowMs - since > SPOT_LATE_MS)),
    retry: () => {
      setSince(Date.now());
      void signed.refetch();
    },
  };
}
