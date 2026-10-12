/**
 * Portfolio words — Ported from Masayume 68f7a09:web/src/lib/copy.ts (PORTFOLIO, BALANCE, PAGER) and
 * features/markets/portfolio/plate/copy.ts (PLATE), with Agari 03b30ab's cash-out (L-35) and Tempo's pools: engine
 * credit per Window and cash behind resting orders, never summed into the headline.
 */
export const PORTFOLIO = {
  betsTitle: "Your bets",
  tabs: { open: "Open", history: "History" },
  noBets: "No bets yet.",
  firstCall: "make your first call",
  live: "Live",
  settling: "Settling",
  scheduled: "Scheduled",
  left: "left",
  stake: "Staked",
  value: "Worth now",
  pnl: "P&L",
  bothSides: "UP + DOWN",
  toMarkets: "Go to Markets",
  noHistory: "No settled Windows yet — they show here the moment one settles.",
  outcome: { win: "WIN", loss: "LOSS", void: "VOID", closed: "CLOSED" } as Record<string, string>,
  range: { label: "Range", d7: "7D", d30: "30D", all: "All" },
  pnlFormula: "Net P&L = payout − what you paid, per settled Window.",
  settledOn: "Settled",
  asset: "Window",
  side: "Side",
  entry: "Entry",
  traderEdge: "Trader Edge →",
} as const;

/** The settled-calls journal (21st 27124). */
export const JOURNAL = {
  title: "Settled calls",
  count: (n: number) => `${n} ${n === 1 ? "call" : "calls"}`,
  range: "Range",
  ranges: [{ label: "7D", days: 7 }, { label: "30D", days: 30 }, { label: "All", days: Number.POSITIVE_INFINITY }],
  cols: { date: "Settled", window: "Window", side: "Side", stake: "Staked", net: "Net P&L", outcome: "Outcome" },
  empty: "No settled calls in this range.",
} as const;

/** The record curve (21st 29532). */
export const RECORD_CHART = {
  title: "Realised P&L",
  range: "Range",
  ranges: [{ label: "7D", days: 7 }, { label: "30D", days: 30 }, { label: "All", days: Number.POSITIVE_INFINITY }],
  drawdown: "Below peak",
  peak: "Deepest",
  empty: "Your P&L curve starts with your first settled Window.",
  error: "Couldn't read your settled Windows. Nothing changed; try again.",
  retry: "Try again",
  caption: "Realised P&L by settled Window, with the distance below its running peak",
} as const;

export const PLATE = {
  eyebrow: "Ready to bet",
  yours: "yours",
  elsewhere: "elsewhere",
  addMoney: "Add money",
  getTest: "Get test dollars",
  inWallet: "In your account",
  inAccount: "In your Trading Balance",
  open: "open",
  settled: "settled",
  poolsEyebrow: "Elsewhere · not spendable here",
  pools: {
    escrow: { label: "Resting orders", note: "Locked behind your scheduled calls until they fill or you cancel." },
    credit: { label: "Credit on Windows", note: "Payouts and refunds waiting on settled Windows — Collect pays them to your account." },
  },
  connect: { title: "Sign in", newHere: "New here? Test dollars are free →" },
  chart: { title: "Account value", empty: "Your account value shows here once you've settled a Window.", peak: "below peak" },
} as const;

export const CASH_OUT = {
  cashOut: "Cash out",
  closeFor: (amount: string) => `Close for ${amount}`,
  cashingOut: "Cashing out…",
  noLiquidity: "No exit liquidity right now",
  locked: "No exit liquidity: this Window has locked, it pays at settlement",
  nothingSold: "Nothing sold: the book moved before the sell landed. Your position is unchanged.",
  requote: (floor: string) => `The book moved past your close tolerance: the exit now pays at least ${floor}.`,
  pending: "Waiting for the chain to answer — the sell is journaled, nothing is re-sent.",
  done: "Cashed out",
  doneBody: (proceeds: string) => `${proceeds} is back in your account.`,
  failed: "Nothing sold. Your position is unchanged.",
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
  notSummed: "not in this figure",
  legs: { dollars: "Test dollars", positions: "Open positions · at mark", collect: "To collect" },
  addMoney: "Add money",
  getTest: "Get test dollars",
  trade: "Trade",
  open: "open",
  settled: "settled",
  pocketsTitle: "Pockets",
  manage: "Manage",
  pockets: {
    vault: { label: "Trading Balance", note: "Taps spend from here with no prompt." },
    private: { label: "Private", note: "Private bets spend from this. Only you can withdraw it." },
  },
  collectTitle: "To collect",
  betsTitle: "Your bets",
  demo: { title: "Demo", note: "Paper dollars in this browser.", cta: "Trade on paper" },
} as const;
