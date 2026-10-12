/**
 * Every word the games shell says. Kept in one file so the honesty rules are readable in one
 * place: no sentence here promises an opponent, a payout, a rating or a streak that some real
 * record does not already carry, and every "not yet" names what it is waiting on.
 */
export const GAMES = {
  eyebrow: "Play the same live Windows",
  title: "Games",
  intro:
    "Seven modes over the same live markets. Each one says plainly whose money is at risk before you start, because a game that hides that is not a game.",

  sections: {
    prediction: { number: "01", title: "Prediction", desc: "Real positions or a house-funded outcome on a live Window." },
    duel: { number: "02", title: "Duel", desc: "The swipe loop — alone with no stake, or against another player." },
    arcade: { number: "03", title: "Arcade", desc: "Score-only runs. Nothing here touches the ledger." },
    profile: { number: "04", title: "Your games", desc: "Who you are in the games, and what the arena has recorded for you." },
    history: { number: "05", title: "History", desc: "Every finished match and every spin, with the transactions that decided them." },
  },

  card: {
    open: "Open",
    pendingBadge: "Not connected",
    liveBadge: "Live",
    /**
     * S23: the stock market is shut, so only the 24/7 lanes have Windows to play on. On Canton those are BTC and ETH
     * (Coinbase, Kraken and Bitstamp closes) and the pre-IPO names and baskets (PreStocks), `docs/evidence/c6-lanes-*`.
     */
    afterHoursBadge: "24/7 only",
    afterHours: (label: string) => `US stocks closed${/^(closed)?$/i.test(label) ? "" : ` · ${label}`} · BTC, ETH, pre-IPO and baskets only`,
    unavailableBadge: "Unavailable",
    waitingOn: (dependency: string) => `Waiting on ${dependency}`,
    paused: "Paused by the operator",
    /**
     * Who is here, said on the card and before any wallet is involved.
     *
     * The one question that decides whether a mode is worth opening used to cost a signature to answer:
     * the duel showed nothing at all until a wallet had connected and signed. A count is not private —
     * it is the same number the room already broadcasts to everyone in a queue.
     */
    searching: (n: number) => (n === 1 ? "1 player searching" : `${n} players searching`),
    inMatch: (n: number) => (n === 1 ? "1 duel in progress" : `${n} duels in progress`),
    nobody: "Nobody is searching right now",
    roomDown: "The duel room is not answering",
  },

  rail: {
    back: "Games",
    settings: "Game settings",
    resume: "Resume match",
    resumeHint: "You have a match in progress",
  },

  resume: {
    title: "Your match",
    body: "The arena still has this match open. It always wins over starting a new one.",
    cta: "Open",
    result: "See the result",
    live: "Live",
    done: "Done",
    versus: "vs",
    settled: "Cards settled",
  },
  lastGame: {
    title: "Pick up where you left off",
    body: (name: string) => `You were last in ${name}.`,
    cta: "Continue",
  },
  rank: { cta: "See the ladder" },
  howToWords: { open: "How to play", eyebrow: "How to play", close: "Close", got: "Got it" },
  /** Pips's per-game HOW TO, three sentences each — what a first-time player needs and nothing they do not. */
  howTo: {
    practice: ["Five live Windows come as cards. Swipe up if you think the price settles above its line, down if below.", "Nothing is staked; the round scores you against a bot on the real closing prints.", "Every Window's clock is real — the round ends when the last card settles."],
    duel: ["Pick a stake, find an opponent, and sign once: the entry names a key that places your picks.", "Both of you play the same sealed deck. Each swipe is a real order on that Window, at most the card's cap.", "When every card settles, the higher measured PnL takes the side-pot. Your positions are yours either way."],
    lucky: ["A live Window and a side are drawn for you from a seed you can check.", "You see the real quote before anything is placed; one tap places one order.", "It settles like any other call on the venue."],
    range: ["Choose a band around the price and a Window.", "The house prices the band; you win the full payout if the print closes inside it.", "Outside the band, the stake is lost — and the odds say so up front."],
    moonshot: ["Pick a multiple. A level is solved so that hitting it pays that multiple.", "It is one band with a far edge, priced by the same house model as Range.", "Hit it and the payout is the multiple; miss and the stake is lost."],
    "line-rider": ["A line scrolls in from the right, drawn from a seed you can see. Drag on the screen, scroll, or hold the arrow keys to keep the dot on it.", "Hugging the line builds a combo and refills your grip; drifting off drains it. Grip empty, run over.", "No stake and nothing on the ledger. Your inputs are recorded and the server replays the run before it records the score."],
    "candle-hop": ["Candles scroll in from a seed you can see. Tap the screen or press Space to hop; gravity does the rest.", "Slip through each gap for a point. Clip a candle or the floor and the run ends.", "No stake and nothing on the ledger. Your inputs are recorded and the server replays the run before it records the score."],
  } as Record<string, readonly string[]>,

  profile: {
    signedOut: {
      title: "Take a seat to carry a profile",
      body: "Your games identity is your address — the same one that signs the orders. Nothing is stored until you play.",
    },
    you: "You",
    accent: "Accent",
    accentHint: "Your ring on stages and share cards.",
    rating: "Rating",
    record: "Record",
    streak: "Streak",
    /** Shown in place of a number when nothing has ever written that number. */
    unrecorded: "—",
    pending: "Rating, record and streak are not connected to this profile yet. Your recorded duels and the season ladder are available below.",
  },

  achievements: {
    title: "Achievements",
    body: "Earned from the record itself: duels the arena settled, ratings the settler verified, arcade scores the room vouched for, Lucky Draws the venue resolved.",
    connect: "Take a seat to see which of these you hold. Each one is earned from a settled record, never from a counter kept here.",
    noStore: "This deployment keeps no games store, so nothing has been recorded to earn them from.",
    count: (earned: number, total: number) => `${earned} of ${total} earned`,
  },

  historyPage: {
    title: "Your duels",
    connect: "Take a seat to see the duels it has played.",
    loading: "Reading your duels…",
    notConfigured: "This deployment has no games store, so there is no history to read here. Every match is still on the ledger.",
    empty: "No duels yet. The first one is one queue away.",
    live: "Live",
    won: "Won",
    lost: "Lost",
    tied: "Draw",
    free: "Free",
    ranked: (pot: string, symbol: string) => `Ranked · ${pot} ${symbol}`,
    cards: "cards",
    noOpponent: "no opponent yet",
  },
  rankPage: {
    title: "The ladder",
    intro: "Ratings move only on ranked duels the settler has verified. There is no season and no prize here — the ladder is the record.",
    /** Flicky's Season overlay (`rank.tsx`): said only when the operator has named a season and a pool escrows it. */
    introSeason: "Ratings move only on ranked duels the settler has verified. This season pays the top of the ladder from a pool that already sits in a contract.",
    /** C9e: what the ladder says before the season read answers, and when it could not be read. */
    introLoading: "Ratings move only on ranked duels the settler has verified.",
    introUnread: "Ratings move only on ranked duels the settler has verified. The season could not be read just now, so no prize is shown; it is read again in a moment.",
    introSeasonUnescrowed: "Ratings move only on ranked duels the settler has verified. This season names prizes, but no pool on the ledger holds them, so nothing is promised.",
    loading: "Reading the ladder…",
    notConfigured: "This deployment has no games store, so there is no ladder to read here.",
    empty: "Nobody has a verified ranked duel yet.",
    you: "you",
    matches: (n: number) => (n === 1 ? "1 verified duel" : `${n} verified duels`),
    pool: (total: string, currency: string) => `${total} ${currency} pool`,
    endsIn: (clock: string) => `ends in ${clock}`,
    ended: "season over",
    yourRank: "your rank",
    unranked: "not ranked yet",
    prizes: (name: string) => `${name} prizes`,
    each: "each",
    eligible: (n: number) => `eligible: ${n}+ ranked duels`,
    escrowed: (amount: string, symbol: string) => `escrowed on the ledger: ${amount} ${symbol}`,
    escrowShort: (have: string, want: string, symbol: string) => `escrowed on the ledger: ${have} of ${want} ${symbol}`,
    notEscrowed: "no prize pool is deployed on this network — nothing here is escrowed",
    distributed: "the pool has paid out",
    prize: (amount: number, currency: string) => `${amount} ${currency}`,
    locked: (have: number, need: number) => `${have}/${need} ranked`,
    finishToEnter: "finish a ranked duel to enter the ranks",
    connectToSee: "take a seat to see your rank",
    ordinal: (n: number) => {
      const v = n % 100;
      const suffix = v >= 11 && v <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
      return `${n}${suffix}`;
    },
  },
  /** Flicky's season banner on the hub and the ladder, drawn here rather than shipped as a PNG. */
  seasonBanner: {
    eyebrow: "season",
    cta: "see the prizes",
  },
  history: {
    body: "Every duel you have played and every spin you have made, newest first, with how each ended and what the ledger recorded.",
    cta: "See your history",
    title: "Finished matches",
    pending:
      "Finished matches are read back from the arena's own events, indexed so a history page is one query rather than a log replay. The arena is not on this network yet.",
    dependency: "the Arena contracts of abu-pm-games and the ops projector on this network (proven on the local sandbox, not yet on DevNet)",
  },

  settings: {
    title: "Game settings",
    intro: "These apply the moment you change them, and they stay on this device.",
    sfx: { label: "Sound effects", hint: "Swipes, the match, each card as it settles, and the result. Zero is silent." },
    music: { label: "Music", hint: "A chiptune bed under the games, sequenced by the app itself rather than played from a track. Zero is silent." },
    credits: "Sound effects by Kenney (kenney.nl), CC0. The music bed is this app's own. Pixel type m6x11plus by Daniel Linssen.",
    haptics: { label: "Haptics", hint: "A short buzz on the same moments." },
    hapticsUnsupported: "This device does not report vibration support.",
    motion: {
      label: "Motion",
      hint: "Stages animate by default. Reduced keeps every state change, and drops the movement.",
      system: "Follow system",
      systemOnHint: "Your system currently asks for reduced motion.",
      systemOffHint: "Your system currently allows full motion.",
      full: "Full",
      reduced: "Reduced",
    },
    close: "Done",
    /** The one thing a player could otherwise get wrong about where these live. */
    scope: "Kept on this device. Nothing here is signed or sent anywhere.",
  },
} as const;
