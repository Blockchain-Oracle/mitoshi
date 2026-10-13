import { isTickerSymbol } from "@cwf/core";

/** Where a `$SYM` goes (D-226, Owarine `tickerHref`): every listed ticker opens its hub (R4-10, D-227: coins too); anything
 *  else opens its chart. */
export function tickerHref(symbol: string): string {
  const upper = symbol.toUpperCase();
  return isTickerSymbol(upper) ? `/tickers/${upper}` : `/trade/${upper}`;
}

/**
 * The hub's address, settled by the proxy before render (R4-10, D-227), as `tradeRedirect` settles the terminal's:
 * `/tickers/tsla` → `/tickers/TSLA`; an unlisted symbol is "missing", a real 404 (the page streams behind its loading
 * boundary, so a `notFound()` there answers 200 with an empty title); null when the path is the hub's own.
 */
export function tickerHubRoute(pathname: string): { redirect: string } | "missing" | null {
  const m = /^\/tickers\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const upper = m[1]!.toUpperCase();
  if (!isTickerSymbol(upper)) return "missing";
  return m[1] !== upper ? { redirect: `/tickers/${upper}` } : null;
}
