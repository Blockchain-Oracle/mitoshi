import { isTickerSymbol } from "@cwf/core";

/** Where a `$SYM` goes (D-226, Owarine `tickerHref`): every listed ticker opens its hub (R4-10, D-227: coins too); anything
 *  else opens its chart. */
export function tickerHref(symbol: string): string {
  const upper = symbol.toUpperCase();
  return isTickerSymbol(upper) ? `/tickers/${upper}` : `/trade/${upper}`;
}
