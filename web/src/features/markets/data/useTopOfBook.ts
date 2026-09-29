"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/hero/useTopOfBook.ts — the best ask on each side, in cents, off
// the engine's real book (`keys.depth`, refreshed by the stream on every book event). An empty side reads "—".
import type { EventMarket } from "@cwf/core";
import { isOk } from "@cwf/core";
import { bpsToOddsCents } from "@cwf/core/units";
import { useBookDepth } from "@cwf/markets/react";

export interface TopOfBook {
  upCents: number | null;
  downCents: number | null;
  hydrating: boolean;
}

/** `pollMs`: the hero and the ticket keep the 5 s default; a card in a long list asks for less (the stream refreshes it). */
export function useTopOfBook(market: Pick<EventMarket, "marketId" | "decimals"> | null, pollMs?: number): TopOfBook {
  const book = useBookDepth(market, pollMs ? { pollMs } : {});
  const depth = book && isOk(book) ? book.value : null;
  const up = depth?.upAsks[0];
  const down = depth?.downAsks[0];
  return { upCents: up ? bpsToOddsCents(up.priceBps) : null, downCents: down ? bpsToOddsCents(down.priceBps) : null, hydrating: book === null };
}
