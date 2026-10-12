import { PRACTICE_WATCH_SEC } from "@cwf/core/games";

/**
 * Everything Practice says.
 *
 * One sentence in here carries the whole mode's honesty and must never be softened: practice scores
 * on the live feed over a short watch, **not** on the Window's settlement. Everything else — no
 * stake, no position, no ladder, an opponent that flips a coin — follows from saying that plainly
 * (`04-game-system.md` §Practice and arcade state).
 */
export const PRACTICE = {
  eyebrow: "No stake · no position · nothing on the ledger",
  title: "Practice",
  intro: "Swipe live Windows the way you think price goes. Nothing at risk.",

  scoring: {
    label: "How this is scored",
    body: `Each card is scored on the live public price ${PRACTICE_WATCH_SEC} seconds after your last swipe — not on the Window's own settlement, which takes as long as the Window does. The prices are real. Nothing here is a position, a payout or a rating.`,
  },

  tutorial: {
    title: "How practice works",
    steps: [
      "A card is one of the venue's live Windows. Swipe it up if you think the price rises, down if you think it falls — the arrow keys and the two buttons do the same thing.",
      `When the last card is played, the round watches the live feed for ${PRACTICE_WATCH_SEC} seconds and scores every card at that one moment.`,
      "The opponent is a coin flip and is labelled as one. It is here so the round has the duel's shape, not because it knows anything.",
    ],
    dismiss: "Got it",
    reopen: "How this works",
  },

  card: {
    /** The quote box, on the same bands as the duel's: the eyebrow and the question it sets up. */
    eyebrow: (asset: string) => `will ${asset} be higher`,
    question: `${PRACTICE_WATCH_SEC}s after you swipe?`,
    live: "Live",
    stake: "stake",
    noStake: "none",
    window: "From the Window",
    windowValue: (cadence: string) => `${cadence} · settles on its own clock`,
    noPrice: "Waiting for the live price",
  },

  deal: {
    dealing: "Dealing from the venue's live Windows…",
    none: {
      title: "No Window to practise on",
      body: "Practice deals from the venue's live Windows, and right now none has enough time left to run a round. The next roll brings one.",
      /** S23: overnight and at weekends only the 24/7 Windows run: BTC and ETH on Canton (C6), pre-IPO and baskets (the hub card's same list). */
      closedBody: (label: string) => `US stocks closed${/^(closed)?$/i.test(label) ? "" : ` · ${label}`}. Practice deals from the 24/7 Windows (BTC, ETH, pre-IPO and baskets) until then, and none has enough time left to run a round right now: a card needs two minutes.`,
    },
    offline: {
      title: "The venue is not readable",
      body: "Practice needs the live Window list and the live price feed. Both are reads, so nothing was signed and nothing was spent.",
    },
  },

  watch: {
    label: "Watching the feed",
    body: "Every card is scored at the same moment, so no card gets a longer run than another.",
    left: (sec: number) => `${sec}s`,
  },

  result: {
    title: "Round over",
    you: "You",
    bot: "Practice bot",
    botNote: "Picks at random. Nothing about this opponent is a real player or a real record.",
    won: "You took it",
    lost: "The coin flip took it",
    tied: "Level",
    /** What the feed did. */
    move: { up: "Rose", down: "Fell", flat: "Flat" },
    /** What a player called. A call is not a move, and the row must not print one as the other. */
    call: { up: "Up", down: "Down" },
    arrow: { up: "↑", down: "↓", flat: "·" },
    cardResult: { won: "Won", lost: "Lost", flat: "Flat" },
    flatNote: "A flat feed is nobody's card — neither side is given it.",
    unscored: (n: number) => `${n} card${n === 1 ? "" : "s"} could not be scored: the live price was unreadable when the watch closed.`,
    again: "Play again",
    toDuel: "Play a real duel",
    entry: "Entry",
    close: "Close",
  },

  /** Reachable from the stage at any time; a practice round has nothing to lose by being abandoned. */
  restart: "New deck",
} as const;
