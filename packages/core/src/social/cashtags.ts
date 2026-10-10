// Ported from Agari 03b30ab:web/src/features/takes/cashtags.ts — moved into core (pure; the take route and the feed read
// it), the ticker hub link becoming the terminal (`/trade/<SYMBOL>`, the revamp's one market screen, D-189).
import { isTickerSymbol, type TickerSymbol } from "../market/tickers";

/** The most tickers one take is filed under; the Window's own asset is always one of them. */
export const TAKE_TAGS_MAX = 4;

/** `$` then one to five capitals, ending at a word boundary: `$TSLA,` and `$GOOGL` match, `$TSLAx` does not. */
const CASHTAG_RE = /\$([A-Z]{1,5})\b/g;

/**
 * The tickers a take is filed under: its Window's asset first, then every `$TICKER` in the caption that is in the
 * registry, without repeats, at most four. A `$` word outside the registry stays plain text — neither a tag nor a link.
 * The server derives the tags from the caption it stored, never from the request.
 */
export function parseCashtags(caption: string, asset: string): TickerSymbol[] {
  const tags: TickerSymbol[] = [];
  const add = (symbol: string | undefined) => {
    if (tags.length < TAKE_TAGS_MAX && isTickerSymbol(symbol) && !tags.includes(symbol)) tags.push(symbol);
  };
  add(asset);
  for (const match of caption.matchAll(CASHTAG_RE)) add(match[1]);
  return tags;
}

export type CaptionPart = { text: string } | { text: string; symbol: TickerSymbol };

/** A caption cut into plain runs and registry cashtags, so each tag renders as a link to its terminal. */
export function captionParts(caption: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  let from = 0;
  for (const match of caption.matchAll(CASHTAG_RE)) {
    const symbol = match[1];
    if (!isTickerSymbol(symbol)) continue;
    if (match.index > from) parts.push({ text: caption.slice(from, match.index) });
    parts.push({ text: match[0], symbol });
    from = match.index + match[0].length;
  }
  if (from < caption.length) parts.push({ text: caption.slice(from) });
  return parts;
}
