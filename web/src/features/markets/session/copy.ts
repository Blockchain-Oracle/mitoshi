/**
 * The session's own words beyond core's (`sessionStateWord`, `sessionPhrase`, `haltLabel`): what a screen reader hears
 * and the halt's age. Ported in purpose from Agari 03b30ab:web/src/lib/copy.ts `MARKETS.session`.
 */
export const SESSION = {
  /** "NYSE: Weekend · reopens Mon 14:30 (09:30 ET)" — the cell's one accessible sentence. */
  aria: (word: string, tail: string | null) => `NYSE: ${word}${tail ? ` · ${tail}` : ""}`,
  haltAria: (label: string, asset: string, since: string) => `${asset}: ${label} since ${since}`,
  since: (at: string) => `since ${at}`,
  /** The halt banner's line, by who stopped the price (the title is core's `haltLabel`). */
  haltBody: {
    "exchange-halt": (asset: string, since: string) => `The exchange paused ${asset} at ${since}. No new calls until it resumes; an open Window settles on its signed close, or voids if no print can be recorded — both sides then pay 0.5.`,
    "datastreams-closed": (asset: string, since: string) => `Chainlink reports ${asset}'s market closed since ${since}. No new calls until it reopens; an open Window settles on its signed close, or voids — both sides then pay 0.5.`,
    "datastreams-stale": (asset: string, since: string) => `Chainlink hasn't signed a fresh ${asset} price since ${since}. No new calls until it does; a Window whose print can't be recorded voids — both sides pay 0.5.`,
    "redstone-stale": (asset: string, since: string) => `RedStone hasn't signed a fresh ${asset} price since ${since}. No new calls until it does; a Window whose print can't be recorded voids — both sides pay 0.5.`,
    "redstone-signers": (asset: string, since: string) => `Too few of RedStone's signers have signed ${asset} since ${since}. No new calls until enough do; a Window whose print can't be recorded voids — both sides pay 0.5.`,
  },
} as const;
