/**
 * Portfolio words — Ported from Masayume 68f7a09:web/src/lib/copy.ts (PORTFOLIO, BALANCE, PAGER) and
 * features/markets/portfolio/plate/copy.ts (PLATE), with Agari 03b30ab's cash-out (L-35) and Tempo's pools: engine
 * credit per Window and cash behind resting orders, never summed into the headline. R4-4 (D-227): Owarine 90a91d71's
 * `history/copy.ts` (HISTORY) in dollars, its two-line rows' words, and the copy cuts (Owarine's word counts or fewer).
 */
export const PORTFOLIO = {
  betsTitle: "Your bets",
  tabs: { open: "Open", history: "History" },
  noBets: "No bets yet.",
  firstCall: "Make your first call",
  live: "Live",
  settling: "Settling",
  scheduled: "Scheduled",
  left: "left",
  stake: "Staked",
  value: "Worth now",
  pnl: "P&L",
  bothSides: "UP + DOWN",
  close: "Close",
  toMarkets: "Go to Markets",
  boosts: "Boosts",
} as const;

/** The record curve (21st 29532) — Trader Edge's, the one place it is drawn. */
export const RECORD_CHART = {
  title: "Realised P&L",
  range: "Range",
  ranges: [{ label: "7D", days: 7 }, { label: "30D", days: 30 }, { label: "All", days: Number.POSITIVE_INFINITY }],
  drawdown: "Below peak",
  peak: "Deepest",
  empty: "Starts with your first settled Window.",
  error: "Couldn't read your settled Windows.",
  retry: "Try again",
  caption: "Realised P&L by settled Window, with the distance below its running peak",
} as const;

export const PLATE = {
  pools: {
    escrow: { label: "Resting orders", note: "Locked behind scheduled calls." },
  },
} as const;

export const CASH_OUT = {
  closeFor: (amount: string) => `Close for ${amount}`,
  cashingOut: "Closing…",
} as const;

export const PAGER = {
  aria: "Pages",
  prev: "← Prev",
  next: "Next →",
  range: (from: number, to: number, total: number) => `${from}–${to} of ${total}`,
} as const;

/** The money card and pockets (Owarine 90a91d71 `plate/copy.ts`; P2, D-223). */
export const HERO_MONEY = {
  eyebrow: "Your balance",
  ready: "ready to bet",
  /** A figure before its read lands (never $0.00). */
  pending: "—",
  notSummed: "not in this figure",
  legs: { dollars: "Test dollars", positions: "Open · what Close pays", collect: "To collect" },
  addMoney: "Add money",
  getTest: "Get test dollars",
  trade: "Trade",
  collect: "Collect",
  collecting: "Collecting…",
  open: "open",
  settled: "settled",
  pocketsTitle: "Pockets",
  manage: "Manage",
  pockets: {
    vault: { label: "Trading Balance", note: "Taps spend from here with no prompt." },
    private: { label: "Private", note: "Private bets spend from this. Only you withdraw it." },
  },
  blocked: { passkey: "Needs a passkey account", network: "Not on this network" },
  collectTitle: "To collect",
  /** Signed out (R6 money, S07): the same card on DEMO's paper account. */
  paper: {
    eyebrow: "Paper balance",
    tag: "DEMO",
    dollars: "Paper dollars",
    onPaper: "on paper",
    signIn: "Sign in to use test dollars",
    afterSignIn: "After sign-in",
    openTitle: "Open on paper",
    settledTitle: "Settled on paper",
  },
} as const;

/** The settled list, its receipt, the record and the Trader Edge link (Owarine 90a91d71 `history/copy.ts`, in dollars). */
export const HISTORY = {
  outcome: { win: "Won", loss: "Lost", void: "Void", closed: "Closed early" } as Record<string, string>,
  paid: "paid",
  claim: { paid: "collected", "to-collect": "to collect", none: "", unknown: "collection unread" } as Record<string, string>,
  collectLink: "collect →",
  vaultSettling: "settling into Trading Balance",
  via: { vault: "Trading Balance", boost: "Boost" } as Record<string, string>,
  receipt: "Receipt",
  receiptTitle: "Settlement receipt",
  closedTitle: "Cash-out receipt",
  entryTx: "Entry tx",
  proof: "Proof →",
  stake: "Staked",
  sold: "Sold before the close",
  shorted: "sold short",
  partial: "More history than one reading can page; these rows are the latest part.",
  empty: { why: "Nothing settled yet.", nextAction: { label: "Make a call", href: "/markets" } },
  csv: "Download CSV",
  csvName: (address: string) => `mitoshi-history-${address.slice(0, 8)}.csv`,
  csvFailed: "Couldn't build the file. Try again.",
  summary: {
    title: "Your record",
    net: "Net, all settled",
    winRate: "Win rate",
    streak: "Current run",
    streakUnit: (n: number) => (n === 1 ? "win" : "wins"),
    rounds: (settled: number, open: number) => `${settled} settled · ${open} open`,
    curveEmpty: "curve fills as Windows settle",
    curveLabel: (direction: "up" | "down", amount: string) => `Cumulative result curve, currently ${direction} ${amount}`,
    notYet: "—",
  },
  edgeLink: { eyebrow: "Trader Edge", title: "See what's working.", action: "Open report" },
} as const;

/** Reputation and badges (Masayume 68f7a09 / Owarine 90a91d71 `history/copy.ts`): Yosuku's tiers, inherited; no tier pays. */
export const RECORD = {
  tier: "Tier",
  record: (bets: number, wins: number) => `${wins} of ${bets} decided`,
  next: (tier: string) => `Next: ${tier}`,
  top: "Top tier",
  progress: (pct: number) => `${pct}% toward the next tier`,
  tiers: { Novice: "Novice", Trader: "Trader", Whale: "Whale", Oracle: "Oracle" } as Record<string, string>,
  howTiers: "How tiers work",
  rule: "Trader at 5 decided Windows and 45% won, Whale at 15 and 55%, Oracle at 30 and 65%.",
  badges: "Badges",
  unlockedCount: (n: number, total: number) => `${n} of ${total} unlocked`,
  nextBadge: (name: string) => `Next: ${name}`,
  unlocked: "Unlocked",
  locked: "Locked",
  pendingEarn: "Opens with Earn",
  names: {
    first_trade: { name: "First Trade", description: "Opened your first position." },
    winning_streak: { name: "Hot Streak", description: "3 winning Windows in a row." },
    lp_provider: { name: "LP Provider", description: "Supplied the maker vault." },
    whale: { name: "Whale", description: "Staked $1,000 in all." },
    oracle: { name: "Oracle", description: "70%+ won over 10+ decided Windows." },
  } as Record<string, { name: string; description: string }>,
} as const;
