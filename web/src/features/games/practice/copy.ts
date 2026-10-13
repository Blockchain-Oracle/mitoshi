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

  deal: {
    dealing: "Dealing from the live Windows…",
    none: {
      title: "No Window yet",
      body: "No Window long enough yet. Next one soon.",
      closedBody: "US stocks closed. No 24/7 Window has 2 min left — next roll soon.",
    },
    offline: {
      title: "Venue unreadable",
      body: "Live Windows and prices are reads; nothing was signed.",
    },
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
    entry: "Entry",
    close: "Close",
  },

  restart: "New deck",
} as const;
