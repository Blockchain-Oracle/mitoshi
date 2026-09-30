"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/hero/useTopOfBook.ts — the best ask on each side, in cents, off
// the engine's real book (`keys.depth`, refreshed by the stream on every book event). An empty side reads "—".
import type { BookDepth, EventMarket, Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { bpsToOddsCents } from "@cwf/core/units";
import { useBookDepth, useBookDepths } from "@cwf/markets/react";
import { useMemo } from "react";

export interface TopOfBook {
  upCents: number | null;
  downCents: number | null;
  hydrating: boolean;
}

/** The top of one Window's book from its depth reading (null before any answer). */
export function topOf(book: Reading<BookDepth> | null): TopOfBook {
  const depth = book && isOk(book) ? book.value : null;
  const up = depth?.upAsks[0];
  const down = depth?.downAsks[0];
  return { upCents: up ? bpsToOddsCents(up.priceBps) : null, downCents: down ? bpsToOddsCents(down.priceBps) : null, hydrating: book === null };
}

/** `pollMs`: the hero and the ticket keep the 5 s default; a card in a long list asks for less (the stream refreshes it). */
export function useTopOfBook(market: Pick<EventMarket, "marketId" | "decimals"> | null, pollMs?: number): TopOfBook {
  return topOf(useBookDepth(market, pollMs ? { pollMs } : {}));
}

/**
 * The tops of a list of Windows (the lane page, the word board) through one subscription (D-184): the same depth reads
 * as a card's own `useTopOfBook`, answered to the list at once, in `markets` order. Stable while no book changed.
 */
export function useTopsOfBook(markets: readonly Pick<EventMarket, "marketId" | "decimals">[], pollMs: number): readonly TopOfBook[] {
  const readings = useBookDepths(markets, { pollMs });
  return useMemo(() => readings.map(topOf), [readings]);
}
