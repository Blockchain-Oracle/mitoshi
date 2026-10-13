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
  /** The book's read failed (a rate-limited RPC, D-230): the app couldn't look — not an empty book. */
  unread: "CAN'T READ THE BOOK · RETRYING",
  closing: "CLOSING · NEXT ROUND SOON",
  /** A Window waiting for its opening print (D-230): when it opened and a count, never a bare wait. */
  pending: {
    soon: (at: string, left: string) => `OPENED ${at} · PRICE IN ${left}`,
    late: (at: string, waited: string) => `OPENED ${at} · WAITING ${waited}`,
  },
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
  unread: "Can't read the book — retrying",
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
  /** Under the question while the line is pending (D-230): a count, never a bare wait; the reason is under UP/DOWN. */
  pendingDistance: {
    soon: (_at: string, left: string) => `Opening price in ~${left}`,
    late: (_at: string, waited: string) => `Waiting ${waited} for the opening price`,
  },
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
    vs: (label: string) => `vs ${label}`,
  },
} as const;

/**
 * While a Window waits for its opening print (D-230 item 1): when it opened, a live count and why — never a bare wait.
 * `at` is the open in the reader's clock; `left` and `waited` count each second. The cause is named only when ops names
 * it (`/session.prints.stall`); otherwise the line is neutral.
 */
export const OPENING_WAIT = {
  soon: (at: string, left: string) => `Opened ${at} · opening price in ~${left}`,
  late: (at: string, waited: string) => `Opened ${at} · waiting ${waited} for the opening price`,
  unsigned: (at: string, waited: string) => `Opened ${at} · waiting ${waited} for RedStone's opening price`,
  refused: (at: string, waited: string) => `Opened ${at} · waiting ${waited} — RedStone is refusing requests`,
  unreachable: (at: string, waited: string) => `Opened ${at} · waiting ${waited} — RedStone is unreachable`,
  /** The print is in hand but Tempo's RPC keeps refusing the sends (429, -32005, "Request exceeds defined limit"). */
  sending: (at: string, waited: string) => `Opened ${at} · waiting ${waited} — Tempo is busy, retrying`,
  /** The chain didn't answer the read (a rate-limited RPC): the print may be in; reads retry on their own. */
  unread: (at: string) => `Opened ${at} · can't reach Tempo to read its opening price — retrying`,
} as const;

/** An empty side of a trading Window's book (D-230 item 2), said instead of a bare "—". */
export const EMPTY_BOOK = {
  quoting: "No offers yet — the house quotes within seconds of the open",
  closing: (next: string) => `No offers left on this Window — the next opens ${next}`,
  none: "No offers on this side right now",
  /** The book's read failed (a rate-limited RPC): not "no offers" — the app couldn't look. */
  unread: "Can't read the book right now — retrying",
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
