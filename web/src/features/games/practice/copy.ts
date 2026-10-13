import { PRACTICE_WATCH_SEC } from "@cwf/core/games";

/**
 * Everything Practice says — "Beat the coin" (R4-9, D-227; copy cuts #9–#13 and copy bugs 1). The honesty line —
 * scored on the live price after a short watch, not at the Window's settlement — lives in the ⓘ how-to now, verbatim
 * (`GAMES.howTo.practice`); on the stage each element carries one short fragment.
 */
export const PRACTICE = {
  title: "Beat the coin",

  card: {
    eyebrow: (asset: string) => `will ${asset} be higher`,
    question: `in ${PRACTICE_WATCH_SEC} s?`,
    live: "Live",
    crowd: "Crowd",
    crowdUp: (pct: number) => `${pct}% up`,
    noPrice: "Waiting for the live price",
    coach: { up: `↑ higher in ${PRACTICE_WATCH_SEC} s`, down: "↓ lower" },
  },

  versus: { you: "You", coin: "Coin" },

  /** The deck strip (R6 games §4.2.3) and its tiles' accessible names. */
  strip: {
    label: "Your deck",
    now: "Now",
    noPrice: "No price",
    tile: {
      upcoming: (t: string, n: number, of: number) => `${t}, card ${n} of ${of}`,
      active: (t: string, n: number, of: number) => `${t}, card ${n} of ${of}, now`,
      racing: (t: string, you: "up" | "down", coin: "up" | "down", left: number | null) => `${t}, you ${you}, coin ${coin}${left === null ? "" : `, ${left} seconds left`}`,
      scored: (t: string, r: "won" | "lost" | "flat") => `${t}, ${r}`,
      unscored: (t: string) => `${t}, no price`,
    },
  },

  /** The deal's states (§4.2.5): a named wait over the deck's own skeleton, then the honest late state. */
  wait: {
    dealing: "Dealing",
    late: "Windows didn't load",
    price: "Waiting for the price",
    priceLate: "Price feed is late",
    lineRider: "Play Line Rider",
  },

  deal: {
    none: { title: "No Window long enough", body: "Next one soon", closedTitle: "US stocks closed", closedBody: "No 24/7 Window has 2 min left" },
    offline: { title: "Windows didn't load", body: "Nothing was signed." },
  },

  watch: {
    label: "Watching the race",
    left: (sec: number) => `${sec}s`,
    leader: "leads",
  },

  result: {
    title: "Round over",
    you: "You",
    bot: "Coin",
    botNote: "Coin flip, not a player.",
    won: "You beat the coin",
    lost: "The coin took it",
    tied: "Level",
    move: { up: "Rose", down: "Fell", flat: "Flat" },
    call: { up: "Up", down: "Down" },
    arrow: { up: "↑", down: "↓", flat: "·" },
    cardResult: { won: "Won", lost: "Lost", flat: "Flat" },
    flatNote: "Flat is nobody's card.",
    unscored: (n: number) => `${n} unscored · no price`,
    again: "Play again",
    toReal: "Call it for real",
    toDuel: "Play a real duel",
    entry: "Entry",
    close: "Close",
  },

  restart: "New deck",
} as const;
