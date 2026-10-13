/**
 * /markets surface words — Ported from Masayume 68f7a09:web/src/lib/copy.ts (SECTIONS, LANE_CARD, WORD_BOARD, MARKETS,
 * HERO, HERO_HEAD) with Tempo's facts: the line is the Window's signed opening print (RedStone, 1e-8), both sides are
 * the engine's real book, and a lane is a (basis, cadence) pair across tickers (Agari 03b30ab lane-view).
 */
/** The user's pinned calls (D-048), above the lanes. */
export const CALLS_SECTION = { index: "00", title: "Your calls", desc: "" } as const;

/** A pinned call as a compact chip (R4-3, D-227): the countdown, then the verdict in one word. */
export const CALLS_CHIP = {
  open: (asset: string, side: string) => `Your ${asset} ${side} call`,
  settling: "Settling…",
  win: "Won",
  loss: "Lost",
  void: "Void",
} as const;

export const SECTIONS = {
  lanes: { index: "01", title: "Live windows" },
  /** The reference's own §02 header, verbatim. */
  words: { index: "02", title: "Just ask", desc: "Yes or no." },
} as const;

export const LANE_CARD = {
  openTicket: (asset: string) => `Open the ticket for this ${asset} Window`,
  oddsLive: "LIVE ODDS",
  oddsLoading: "READING THE BOOK…",
  /** An empty, read book (Owarine `LANE_CARD.noQuotes`; R4-3): not "reading" forever. */
  noQuotes: "NO QUOTES YET",
  closing: "CLOSING · NEXT ROUND SOON",
  pendingPrint: "WAITING FOR THE STARTING PRICE",
  opensAt: (clock: string) => `OPENS ${clock}`,
  /** Owarine 90a91d71 `CLOSED.kind` / `ListedCard` (O-5). */
  kind247: "24/7 · stock",
  kindCrypto: "24/7 · crypto",
  /** Owarine `ListedCard` (R4-3): the head says when it opens; the body says what a call here does, once. */
  listedHeadline: "Rests at your price till the bell.",
  listedAria: (asset: string) => `Schedule a call on this ${asset} Window`,
  scheduleCta: "Schedule a call",
  scheduleMeta: "your price",
  /** Owarine `PausedCard` / `MARKETS.paused` (R4-3): a ticker the roller holds back in this lane. */
  paused: {
    clock: "PAUSED",
    noSource: "Paused: no signed price",
    corporate: "Paused: corporate action",
    why: (asset: string, cadence: string) => `No ${cadence} ${asset} Window until a signed print can settle it.`,
    haltWhy: (asset: string, cadence: string) => `No new ${cadence} ${asset} Window until the price is healthy.`,
    reason: (why: string) => `Source: ${why}.`,
  },
  priceLoading: "···",
  line: "line",
} as const;

export const WORD_BOARD = {
  reading: "reading the board…",
  between: "Between rounds.",
  /** Owarine word-board states (R4-3): a closed Window, an empty book, the listed companies. */
  kind247: "24/7",
  unquoted: "No quotes yet",
  open: "Open",
  listedWhy: "Schedule a call at your price.",
  closes: (clock: string) => `closes ${clock}`,
  /** The two asks are independent contracts, so the bar is a stated derivation, never "the odds". */
  implied: (share: number) => `${share}% implied on Yes`,
  noLean: "no book on both sides yet",
} as const;

export const MARKETS = {
  up: "UP",
  down: "DOWN",
  estimated: "estimated",
  noBook: "no book",
  live: (n: number) => `${n} live`,
  allTickers: "All",
  tickerGroup: "Ticker",
  laneGroup: "Market length",
  noTickerHere: (ticker: string, lane: string) => `No live ${ticker} Window in the ${lane} lane right now.`,
  noLiveWindows: { why: "No live Windows right now." },
  notes: {
    moved: "That page moved — here are the live Windows.",
    gone: "That Window is gone — showing the live Windows instead.",
    successor: (cadence: string) => `That ${cadence} Window settled — this is the next one.`,
  },
  loadingWindows: "Loading live Windows",
} as const;

export const HERO = {
  openingPrint: "opening print",
  bandLow: "band low",
  bandHigh: "band high",
  livePrice: "live · signed spot",
  pendingPrint: "waiting for the opening print",
  pendingDistance: "Waiting for the opening print.",
  noLivePrice: "No live price.",
  depthTitle: "Top of book",
  buyUp: "Buy UP",
  buyDown: "Buy DOWN",
  noDepth: "no resting offers",
  contracts: "contracts",
  chartLabel: (asset: string, opening: string, live: string) => `${asset ? `${asset} ` : ""}price chart: opening print ${opening}, live ${live}`,
  chartReadout: (time: string, price: string) => `${time} · ${price}`,
  scrubHint: "Arrow keys move through the prices; Escape returns to live.",
  vsLine: "vs the line",
  /** Owarine 90a91d71 `SOURCE_COPY.settles`: the provider's name, nothing more. */
  source: (source: string) => `Settles on ${source}`,
  sources: { redstone: "RedStone", datastreams: "Chainlink Data Streams", attested: "an attested print" } as Record<string, string>,
  sourceUnknown: "a signed oracle",
  phase: {
    upcoming: "Opens soon",
    pendingOpeningPrint: "Waiting for the opening print",
    trading: "Trading",
    noEntryBuffer: "Closing — no new entries",
    locked: "Locked — waiting for the closing print",
    settledUnclaimed: "Settled",
    finalized: "Settled",
    voided: "Voided",
  } as Record<string, string>,
  notFound: { why: "This Window is gone.", nextAction: { label: "Pick a live Window", href: "/markets" } },
  /** The Window chart's own words (Owarine 90a91d71 `HERO.chart`; O-3). */
  chart: {
    opens: "OPENS",
    open: "OPEN",
    closes: "CLOSES",
    closed: "CLOSED",
    pending: "Waiting for the opening print",
    vs: (label: string) => `vs ${label}`,
  },
} as const;

/** The hero-as-ticket head (Yosuku /markets): the opening print is the line. */
export const HERO_HEAD = {
  alert: "Alert",
  holdsAbove: (asset: string) => `${asset} holds above`,
  pair: (asset: string) => `${asset} · USD`,
  cadenceGroup: "Market length",
  betweenRounds: "Between rounds",
  settlesIn: "Settles in",
  opensIn: "Opens in",
  minuteLeft: "One minute left",
  aboveLine: "above the UP line",
  needsForUp: "for UP to win",
  needs: "needs",
  rampUp: "UP",
  noPrice: "—",
  betUp: "Bet UP",
  betDown: "Bet DOWN",
  room: "The Room",
  roomQualifier: "bettors only",
  roomPending: "The Room isn't connected yet.",
  upCosts: (cents: string) => `UP costs ${cents}`,
} as const;

/** The hero's Depth view (21st 29968): the UP side of the book, cumulative contracts. */
export const DEPTH = {
  toggle: "Chart view",
  price: "Price",
  depth: "Depth",
  title: "Order book depth, UP terms",
  mid: "Mid",
  spread: "Spread",
  bidDepth: "UP bids",
  askDepth: "UP asks",
  empty: "No resting orders on this Window.",
  error: "Couldn't read the book.",
  retry: "Try again",
  caption: "Order book depth, UP terms",
  bid: "Bid",
  ask: "Ask",
} as const;

/** The closed-market words (Owarine 90a91d71 `lib/copy-closed.ts`; O-2): plain facts while the US market is shut. */
export const CLOSED = {
  stocksTitle: "US stocks",
  stocksLine: (opens: string) => `${opens}. No trading until the open.`,
  noPrice: "—",
} as const;
