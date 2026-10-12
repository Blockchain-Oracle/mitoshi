import { isStockSymbol } from "@cwf/core";

/** Where a `$SYM` goes (D-226, Owarine `tickerHref`): a listed stock opens its hub, a coin opens its chart. */
export function tickerHref(symbol: string): string {
  const upper = symbol.toUpperCase();
  return isStockSymbol(upper) ? `/tickers/${upper}` : `/trade/${upper}`;
}
