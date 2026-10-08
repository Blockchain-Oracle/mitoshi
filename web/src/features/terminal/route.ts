/**
 * The terminal's address (D-192): `/trade/<SYMBOL>` in upper case, `?lane=` the Window length and `?w=` one Window.
 * `/trade` resolves to the last symbol traded in this browser (the `cwf.trade` cookie the screen writes), else BTC.
 * Shared by the proxy (normalising and redirecting before render) and the screen.
 */
import { isTickerSymbol, type TickerSymbol } from "@cwf/core";

export const TRADE_COOKIE = "cwf.trade";
export const DEFAULT_TRADE_SYMBOL: TickerSymbol = "BTC";

/** `/trade` → the remembered symbol; `/trade/btc` → `/trade/BTC`; null when the path needs no redirect. */
export function tradeRedirect(pathname: string, remembered: string | undefined): string | null {
  if (pathname === "/trade" || pathname === "/trade/") {
    const want = remembered?.toUpperCase();
    return `/trade/${want && isTickerSymbol(want) ? want : DEFAULT_TRADE_SYMBOL}`;
  }
  const m = /^\/trade\/([A-Za-z]{2,6})\/?$/.exec(pathname);
  if (!m) return null;
  const upper = m[1]!.toUpperCase();
  return m[1] !== upper && isTickerSymbol(upper) ? `/trade/${upper}` : null;
}

/** The terminal on one Window: every list (Markets, the word board, Surface) links straight here, no redirect hop. */
export const terminalHref = (asset: string, marketId: string) => `/trade/${asset}?w=${marketId}`;
