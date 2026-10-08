/**
 * The display feed (S23a, D-196): one price per ticker for the terminal's line — the crypto feed's Coinbase trades (or
 * the five-venue median), the stocks' Alpaca IEX trades in session, and RedStone's signed values whenever the fast
 * source has said nothing for `FAST_STALE_MS` (off-hours, a venue outage, no Alpaca keys). A stock outside regular hours
 * falls back to its 24/7 feed (`<T>-24`), the one its 24/7 lanes settle on; PLTR and AMD have none and hold their
 * regular close. Quotes only move forward in time. Never joined into the settlement `SpotFeed`.
 */
import { TICKER_SYMBOLS, type SessionState, type TickerSymbol } from "@cwf/core";
import type { SpotFeed, SpotQuote } from "../prices/spot";
import type { DisplayFeedHandle, DisplayQuote } from "./types";

/** A fast source silent this long hands the line to RedStone until it speaks again. */
export const FAST_STALE_MS = 15_000;
const REGULAR: readonly SessionState[] = ["regular", "early-close"];

const isTicker = (s: string): s is TickerSymbol => (TICKER_SYMBOLS as readonly string[]).includes(s);

/** Which RedStone key carries a ticker's line now: the 24/7 key outside regular hours when the ticker has one. */
export function redstoneKeyFor(symbol: TickerSymbol, state: SessionState | null, has24: (key: string) => boolean): string {
  const key24 = `${symbol}-24`;
  return state !== null && !REGULAR.includes(state) && has24(key24) ? key24 : symbol;
}

export function createDisplayFeed(input: {
  crypto: DisplayFeedHandle;
  stocks: DisplayFeedHandle | null;
  spot: SpotFeed | null;
  sessionState: (nowSec: number) => SessionState | null;
  nowMs?: () => number;
}): DisplayFeedHandle {
  const now = input.nowMs ?? Date.now;
  const quotes = new Map<TickerSymbol, DisplayQuote>();
  /** Wall time a fast source (Coinbase, venues, Alpaca) last moved each ticker. */
  const fastMs = new Map<TickerSymbol, number>();
  const listeners = new Set<(q: DisplayQuote) => void>();
  const offs: Array<() => void> = [];

  const publish = (q: DisplayQuote) => {
    const prev = quotes.get(q.symbol);
    if (prev && prev.atMs > q.atMs) return;
    if (prev && prev.atMs === q.atMs && prev.priceE8 === q.priceE8) return;
    quotes.set(q.symbol, q);
    for (const l of listeners) l(q);
  };
  const fast = (q: DisplayQuote) => {
    fastMs.set(q.symbol, now());
    publish(q);
  };
  const signed = (q: SpotQuote) => {
    const base = q.symbol.replace(/-24$/, "");
    if (!isTicker(base)) return;
    if (now() - (fastMs.get(base) ?? 0) < FAST_STALE_MS) return;
    const key = redstoneKeyFor(base, input.sessionState(Math.floor(now() / 1000)), (k) => input.spot?.newest(k as SpotQuote["symbol"]) !== null);
    if (q.symbol !== key) return;
    publish({ symbol: base, priceE8: q.priceE8, atMs: q.publishTimeSec * 1000, source: "redstone" });
  };

  return {
    start() {
      offs.push(input.crypto.subscribe(fast));
      if (input.stocks) offs.push(input.stocks.subscribe(fast));
      if (input.spot) {
        offs.push(input.spot.subscribe(signed));
        // Seed every ticker from the newest signed values so the line has a price before the first fast tick.
        for (const s of input.spot.symbols()) {
          const q = input.spot.newest(s);
          if (q) signed(q);
        }
      }
      input.crypto.start();
      input.stocks?.start();
    },
    stop() {
      for (const off of offs.splice(0)) off();
      input.crypto.stop();
      input.stocks?.stop();
    },
    latest: (symbol) => quotes.get(symbol) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
