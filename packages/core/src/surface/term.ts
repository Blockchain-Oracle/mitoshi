// Ported from Masayume 68f7a09:packages/core/src/surface/term.ts
import { formatCadence } from "../market/lanes";
import type { Reading } from "../schemas/reading";
import type { EventMarket, MarketId } from "../types/market";
import type { BookDepth } from "../types/trading";
import { remainingSec } from "../units/time";
import { bookStructure, impliedUp, type BookStructure, type ImpliedUp } from "./structure";

/** One live Window of an asset, priced off its own book — a point on the term structure. */
export interface TermPoint {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  cadence: string;
  expirySec: number;
  remainingSec: number;
  openingPriceRaw: bigint | null;
  /** Null while the book is still hydrating — "…" on the surface, never an empty book nobody has read. */
  structure: BookStructure | null;
  implied: ImpliedUp | null;
  stale: boolean;
  /** The book read failed and nothing good was ever held for it. */
  unavailable: boolean;
}

export interface TermRow {
  market: EventMarket;
  book: Reading<BookDepth> | null;
}

/** Every live Window of the asset, nearest close first, each on its own book. */
export function termPoints(rows: readonly TermRow[], nowMs: number): TermPoint[] {
  return rows
    .map(({ market, book }): TermPoint => {
      const structure = book && book.ok ? bookStructure(book.value) : null;
      return {
        marketId: market.marketId,
        asset: market.asset,
        intervalSec: market.intervalSec,
        cadence: formatCadence(market.intervalSec),
        expirySec: market.expirySec,
        remainingSec: nowMs > 0 ? remainingSec(nowMs, market.expirySec) : 0,
        openingPriceRaw: market.openingPriceRaw,
        structure,
        implied: structure ? impliedUp(structure) : null,
        stale: book?.ok === true && book.stale,
        unavailable: book !== null && !book.ok,
      };
    })
    .sort((a, b) => a.expirySec - b.expirySec);
}

export interface TermBand {
  minBps: number;
  maxBps: number;
}

/** The price band the curve is drawn in: the points' own range, padded, never narrower than `minSpanBps`. */
export function termBand(points: readonly TermPoint[], minSpanBps = 1_000, padFraction = 0.15): TermBand | null {
  const values = points.flatMap((point) => (point.implied ? [point.implied.bps] : []));
  if (values.length === 0) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = Math.max((max - min) * padFraction, (minSpanBps - (max - min)) / 2, 0);
  min = Math.max(0, Math.floor(min - pad));
  max = Math.min(10_000, Math.ceil(max + pad));
  return { minBps: min, maxBps: max };
}
