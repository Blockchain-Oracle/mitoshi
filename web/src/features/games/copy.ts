import type { EconomicKind } from "@cwf/core/games";

/**
 * Every word the games shell says (R4-9, D-227: the hall, at Owarine's word count or fewer). Proof and rules sit behind
 * the ⓘ how-to; on screen each element carries one short fragment. No sentence here promises an opponent, a payout, a
 * rating or a streak that a real record does not already carry.
 */
export const GAMES = {
  title: "Games",

  /** Each cabinet's sticker says whose money is at risk (the descriptor's long label stays the how-to's eyebrow). */
  econ: { none: "Free", "market-order": "Your stake", "market-order-and-pot": "Your stake", "house-position": "House pays" } satisfies Record<EconomicKind, string>,

  card: {
    play: "Play",
    soon: "Soon",
    paused: "Paused",
    unavailable: "Unavailable",
    /** The NYSE is shut; the 24/7 lanes (crypto and the 24/7 stocks) still run (`isAllHoursLane`). */
    afterHours: "Stocks closed · 24/7 lanes live",
    afterHoursNone: "Stocks closed · no 24/7 Window live",
    windowsLive: (n: number) => (n === 1 ? "1 Window live" : `${n} Windows live`),
    top: (top: string, you: string | null) => (you === null ? `Top ${top}` : `Top ${top} · you ${you}`),
    noRuns: "No runs yet",
    goTo: (n: number, total: number) => `${n} of ${total}`,
  },

  hall: {
    featured: "Next live Window",
    cadence: (label: string) => `${label} Window`,
    crowd: (pct: number) => `${pct}% say up`,
    play: "Play",
    continueTo: (name: string) => `Continue ${name} →`,
    noWindow: "No Window long enough yet",
    reading: "Reading the venue…",
    offline: "Venue unreadable",
    nowPlaying: "Now playing",
    tapeUp: "UP",
    tapeDown: "DOWN",
    tapeAgo: (sec: number) => (sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m`),
    runLine: (game: string, score: string) => `${game} ${score}`,
  },

  streak: {
    signedOut: "Sign in to keep your best",
    best: (n: number) => `Best streak ${n}`,
    winRate: (pct: string) => `${pct}% won`,
    noCalls: "No calls yet",
    arcadeBest: (name: string, score: string) => `${name} ${score}`,
  },

  rail: {
    back: "Games",
    settings: "Game settings",
    sound: "Sound",
    mute: "Mute",
    resume: "Resume match",
  },

  howToWords: { open: "How to play", close: "Close", got: "Got it" },
  /** Three fragments per mode (copyCuts #7, #10, #15): what a first-time player needs, and the proof line. */
  howTo: {
    practice: ["Swipe ↑ if it'll be higher in 30 s, ↓ if lower.", "Beat the coin's picks.", "Scored on the live price 30 s after your last swipe · free."],
    duel: ["Same sealed deck for both players.", "Each swipe is a real order, capped per card.", "Higher measured PnL takes the side-pot."],
    lucky: ["Reels draw a live Window, a side and a reach.", "You see the real quote; pull the lever to place it.", "Settles like any call · the draw is checkable."],
    range: ["Pick a Window and a band.", "Closes inside: the house pays the multiple.", "Payout set aside; claim when it lands."],
    moonshot: ["Pick a side and a reach.", "Further pays more.", "Range's model, one edge open."],
    "line-rider": ["Ride the real print line.", "Hug it to build a combo; drift drains your grip.", "Seeded run, replayed by the server before it scores · no stake."],
    "candle-hop": ["Tap to lift through the candle gaps.", "One clipped candle ends it.", "Seeded run, replayed by the server before it scores · no stake."],
  } as Record<string, readonly string[]>,

  settings: {
    title: "Game settings",
    sfx: { label: "Sound" },
    music: { label: "Music" },
    haptics: { label: "Haptics" },
    hapticsUnsupported: "No vibration on this device",
    motion: { label: "Motion", system: "Follow system", full: "Full", reduced: "Reduced" },
    accent: "Accent",
    close: "Done",
    foot: "Saved on this device · sounds by Kenney (CC0) · m6x11plus by Daniel Linssen",
  },

  rank: {
    title: "Rank",
    tabs: { "line-rider": "Line Rider", "candle-hop": "Candle Hop", streaks: "Streaks", lucky: "Lucky" },
    luckyBest: (best: number, draws: number) => `best ${best} · ${draws} settled`,
    empty: "No ranked runs yet. Set the first.",
    noStore: "No board on this deployment.",
    offline: "Board offline · retrying",
    loading: "Reading the board…",
    streakEmpty: "No streaks yet.",
    you: "you",
    calm: "calm",
    streakValue: (n: number) => `${n} in a row`,
  },

  history: {
    title: "History",
    signedOut: "Sign in to see your runs",
    empty: "No runs yet. Your first is one Play away.",
    noStore: "No run history on this deployment.",
    offline: "History offline · retrying",
    loading: "Reading your runs…",
    rank: (n: number) => `#${n}`,
    calm: "calm",
    luckyTitle: "Lucky draws",
    luckyEmpty: "No draws yet.",
  },
} as const;
