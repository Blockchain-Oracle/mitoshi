// The hero phone's Window and its pays (R6 landing L01), pure so the pick and the states are tested. The candidates are
// BTC, then ETH, then SOL (Owarine's "quoted and fresh" fallback): the first with a tradable Window wins — the shortest
// cadence, then the soonest close — where tradable means trading, its opening print in, before the no-entry cutoff
// with 30 s to spare, and quoted on both sides (a UP ask and a DOWN ask). Pays are the book's own: 1000 / ask ticks.

export const HERO_SYMBOLS = ["BTC", "ETH", "SOL"] as const;
/** A Window this close to its cutoff isn't offered: the reader would land on it locking. */
export const HERO_SPARE_SEC = 30;
/** One whole contract, in price ticks (a 1.00 payout). */
export const TICKS_PER_UNIT = 1000;

export interface HeroCandidate {
  symbol: string;
  marketId: string;
  cadenceSec: number;
  tradingStartSec: number;
  expirySec: number;
  /** The no-entry cutoff (`noEntryCutoffSec`). */
  cutoffSec: number;
  /** The signed opening print, 8 decimals, as text. */
  openPriceE8: string;
}

/** The book's best on each side, in ticks per whole contract: UP buys YES at the ask; DOWN buys NO at 1000 − the bid. */
export interface HeroPays {
  upTicks: number | null;
  downTicks: number | null;
}

type Level = readonly [number, bigint];

export function paysOf(book: { bids: readonly Level[]; asks: readonly Level[] } | null): HeroPays {
  if (!book) return { upTicks: null, downTicks: null };
  const ask = book.asks[0]?.[0];
  const bid = book.bids[0]?.[0];
  return {
    upTicks: ask !== undefined && ask > 0 && ask < TICKS_PER_UNIT ? ask : null,
    downTicks: bid !== undefined && bid > 0 && bid < TICKS_PER_UNIT ? TICKS_PER_UNIT - bid : null,
  };
}

export const quoted = (pays: HeroPays) => pays.upTicks !== null && pays.downTicks !== null;

/** "1.92×" from ask ticks; null when there is no ask. */
export function paysText(ticks: number | null): string | null {
  if (ticks === null || !(ticks > 0)) return null;
  const m = TICKS_PER_UNIT / ticks;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(2).replace(/0$/, "")}×`;
}

/**
 * The hero's Window among those `quotedFor` says are quoted, in candidate order: the first symbol with one wins, its
 * shortest cadence, then its soonest close. Null when none is tradable now.
 */
export function pickHeroWindow(windows: readonly HeroCandidate[], nowSec: number, quotedFor: (marketId: string) => boolean): HeroCandidate | null {
  const tradable = windows.filter((w) => w.tradingStartSec <= nowSec && w.cutoffSec - nowSec >= HERO_SPARE_SEC && /^\d+$/.test(w.openPriceE8) && quotedFor(w.marketId));
  for (const symbol of HERO_SYMBOLS) {
    const mine = tradable.filter((w) => w.symbol === symbol).sort((a, b) => a.cadenceSec - b.cadenceSec || a.expirySec - b.expirySec);
    if (mine[0]) return mine[0];
  }
  return null;
}

/** "/trade/BTC?w=0x…&pick=up": the terminal on that Window with the side lit (`terminalHref`'s shape). */
export function sideHref(symbol: string, marketId: string | null, side: "up" | "down"): string {
  return marketId ? `/trade/${symbol}?w=${marketId}&pick=${side}` : `/trade/${symbol}`;
}
