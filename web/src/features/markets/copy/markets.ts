/**
 * /markets surface words — Ported from Masayume 68f7a09:web/src/lib/copy.ts (SECTIONS, LANE_CARD, WORD_BOARD, MARKETS,
 * HERO, HERO_HEAD) with Tempo's facts: the line is the Window's signed opening print (RedStone, 1e-8), both sides are
 * the engine's real book, and a lane is a (basis, cadence) pair across tickers (Agari 03b30ab lane-view).
 */
/** The user's pinned calls (D-048), above the lanes. */
export const CALLS_SECTION = { index: "00", title: "Your calls", desc: "Each call stays here through its verdict and payout — whatever Window the page moves to." } as const;

export const SECTIONS = {
  lanes: { index: "01", title: "Live windows" },
  /** The reference's own §02 header, verbatim. */
  words: { index: "02", title: "Just ask", desc: "No chart to read. Will it be up? Just answer yes or no." },
} as const;

export const LANE_CARD = {
  openTicket: (asset: string) => `Open the ticket for this ${asset} Window`,
  oddsLive: "LIVE ODDS",
  oddsLoading: "READING THE BOOK…",
  closing: "CLOSING · NEXT ROUND SOON",
  opensAt: (clock: string) => `OPENS ${clock}`,
  priceLoading: "···",
  line: "line",
} as const;

export const WORD_BOARD = {
  reading: "reading the board…",
  between: "Between rounds. New questions open as the next Window does.",
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
  noLiveWindows: { why: "No live Windows right now — Windows roll continuously, so this fills in as the next one opens." },
  notes: {
    moved: "That page moved — here are the live Windows.",
    gone: "That Window is gone — showing the live Windows instead.",
    successor: (cadence: string) => `That ${cadence} Window settled — moved you to its successor.`,
  },
  loadingWindows: "Loading live Windows",
} as const;

export const HERO = {
  openingPrint: "opening print",
  livePrice: "live · signed spot",
  pendingPrint: "waiting for the opening print",
  pendingDistance: "No opening print yet — nothing to measure against.",
  noLivePrice: "No live price right now.",
  depthTitle: "Top of book",
  buyUp: "Buy UP",
  buyDown: "Buy DOWN",
  noDepth: "no resting offers",
  contracts: "contracts",
  chartLabel: (asset: string, opening: string, live: string) => `${asset} price: opening print ${opening}, live ${live}`,
  chartReadout: (time: string, price: string) => `${time} · ${price}`,
  scrubHint: "Arrow keys move through the prices; Escape returns to live.",
  source: (source: string) => `Settles on the ${source} signed print at the close · the chart follows the same feed`,
  sources: { redstone: "RedStone", datastreams: "Chainlink Data Streams", attested: "attested" } as Record<string, string>,
  sourceUnknown: "signed oracle",
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
} as const;

/** The hero-as-ticket head (Yosuku /markets): the opening print is the line. */
export const HERO_HEAD = {
  holdsAbove: (asset: string) => `${asset} holds above`,
  pair: (asset: string) => `${asset} · USD`,
  cadenceGroup: "Market length",
  betweenRounds: "Between rounds",
  settlesIn: "Settles in",
  opensIn: "Opens in",
  aboveLine: "above the UP line",
  needsForUp: "for UP to win",
  needs: "needs",
  rampUp: "UP",
  noPrice: "—",
  betUp: "Bet UP",
  betDown: "Bet DOWN",
  room: "The Room",
  roomQualifier: "bettors only",
  roomPending: "The Room opens with the social service — it is not connected yet.",
  upCosts: (cents: string) => `UP costs ${cents}`,
} as const;
