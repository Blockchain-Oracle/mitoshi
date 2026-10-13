/**
 * The session's own words beyond core's (`sessionStateWord`, `sessionPhrase`, `haltLabel`): what a screen reader hears
 * and the halt's age. Ported in purpose from Agari 03b30ab:web/src/lib/copy.ts `MARKETS.session`.
 */
export const SESSION = {
  /** "NYSE: Weekend · reopens Mon 14:30 (09:30 ET)" — the cell's one accessible sentence. */
  aria: (word: string, tail: string | null) => `NYSE: ${word}${tail ? ` · ${tail}` : ""}`,
  haltAria: (label: string, asset: string, since: string) => `${asset}: ${label} since ${since}`,
  since: (at: string) => `since ${at}`,
  roundTheClock: "24/7 market",
  roundTheClockAria: (asset: string) => `${asset} · its 24/7 feed trades around the clock`,
  /** /markets' empty Regular lane outside the session (R4-3, D-227: the copy spec's length): "Weekend · reopens Mon 14:30
   *  (09:30 ET). 24/7 lanes are open." */
  regularClosed: (phrase: string) => `${phrase}. 24/7 lanes are open.`,
  /** The halt banner's one body (R4-3: the title, core's `haltLabel`, already names the cause). */
  haltBody: (since: string) => `No new calls since ${since}. Open Windows settle, or void at half.`,
} as const;
