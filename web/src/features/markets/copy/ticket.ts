/**
 * The Ticket's words — Ported from Masayume 68f7a09:web/src/lib/copy-ticket.ts, with Tempo's facts: one transaction
 * (`[approve, placeOrder]`, no "two signatures this first time"), no fees to pay (the relay covers it), a pre-open call
 * rests at the confirmed limit (Agari 03b30ab schedule ticket, D-088), and the stake is remembered after a fill (D-048).
 */
export const TICKET = {
  title: "Your call",
  sideLabel: "Side",
  stakePlaceholder: "0",
  amount: "Bet amount",
  amountAria: (symbol: string) => `Bet amount in ${symbol}`,
  balance: (amountText: string) => `Balance ${amountText}`,
  minimum: (floorText: string) => `Minimum ${floorText}.`,
  chips: "Quick amounts",
  remembered: (amountText: string) => `Your last stake, ${amountText}, is ready.`,
  currentCost: "Current cost",
  ret: "Return",
  maxLoss: "Max loss",
  toWin: "To win",
  liveOdds: "Live market odds",
  enterAmount: "Enter an amount to quote",
  gettingQuote: "Getting live quote…",
  requoting: "requoting…",
  noLiquidity: "No liquidity at this size — nobody is on the other side right now.",
  partial: (fillableText: string) => `Fills up to ${fillableText} at this size — the rest stays in your wallet.`,
  quoteFailed: (why: string) => `Quote failed: ${why}`,
  chance: (pct: number) => `${pct}% chance`,
  avgPrice: (cents: number) => `Avg. price ${cents}¢`,
  buy: (side: string) => `Buy ${side} for`,
  buyPlain: "Buy",
  booked: (contractsText: string, side: string, avgPriceBps: number) => `Bought ${contractsText} ${side} contracts at ${Math.round(avgPriceBps / 100)}¢`,
  bookedPrefix: "Bought",
  bookedAt: "at",
  rolledBack: "The call did not go through — nothing was taken.",
  nothingFilled: "Nothing filled — the book moved before your order landed. Your stake was never taken.",
  requotePrefix: "The book moved — it now costs up to",
  requoteSuffix: "Confirm again to buy at the new price.",
  txLabel: "entry tx",
  syncing: "Syncing the chain clock…",
  close: "Close",
  /** "No fees to pay" is true on Tempo and says so on the CTA line (§2.1.4). */
  footnote: "No fees to pay · settles on its own, right on the price.",
  footnoteArmed: "Signed by your trading key, no prompt · no fees to pay · settles on its own.",
  footnotePasskey: "One passkey confirm · no fees to pay · settles on its own.",
  creditNote: (creditText: string) => `${creditText} of payout credit on this Window is spent first.`,
  advanced: (fromCadence: string, toCadence: string) => `That ${fromCadence} Window closed for entries — moved you to the next ${toCadence} Window. Side and stake kept.`,
  srCost: (costText: string) => `Cost ${costText}`,
  gate: {
    connect: "Calls are placed from your account and winnings land back in it. Sign in to place one.",
    topUp: "Top up to place this",
    holds: (have: string) => `Your account holds ${have}.`,
    need: (need: string) => `Add ${need} more to place this — test dollars are free here.`,
    empty: "Get free test dollars to place one.",
    addMoney: "Add money",
  },
  signIn: "Sign in",
  openCall: (side: string) => `Your call · ${side}`,
  openCallPlain: "Open your call",
  /** A Listed Window (pre-open, D-088): the call rests at the confirmed limit until the open print lands. */
  scheduled: {
    note: (opens: string) => `This Window opens ${opens}. Your call rests at this price until then and fills when it opens; cancel any time before.`,
    cta: (side: string) => `Schedule ${side} for`,
    rested: "Scheduled — resting until the open.",
    cancel: "Cancel scheduled call",
    cancelled: "Cancelled — the escrow is back in your account.",
    priceLabel: "Your price",
    pays: "per $1 if right",
    priceAria: (side: string) => `Your price for ${side}, in cents`,
    priceChips: "Quick prices",
    stepDown: "One cent lower",
    stepUp: "One cent higher",
    tooSmall: "That stake buys less than one lot at this price.",
  },
} as const;

/**
 * Masayume's ticket controls whose product is real but not deployed yet — shown where the reference puts them and
 * saying exactly what is missing (Masayume 68f7a09:web/src/lib/copy-ticket.ts TICKET_PENDING). S10 lights them up.
 */
export const TICKET_PENDING = {
  modeLabel: "Bet type",
  modeDirection: "Up / Down",
  modeRange: "Range",
  rangePending: "Range bets settle against the RangeReserve contract, which is not deployed yet. Up / Down is live.",
  leverageLabel: "Leverage",
  leveragePending: (multiple: string) => `${multiple} needs the prefunded reserve that backs leveraged payouts. It is not deployed yet, so every bet here is 1×.`,
} as const;

/** The Call (Masayume 68f7a09:web/src/features/share/copy.ts `SHARE.call`, keep-list E.7) — an open position, no result implied. */
export const CALL = {
  up: "▲ CALLING UP",
  down: "▼ CALLING DOWN",
  placed: "Call placed",
  confirming: "Confirming on Tempo…",
  youStakeUpTo: "You stake up to",
  scheduled: "Call scheduled",
  over: (asset: string, line: string) => `${asset} OVER ${line}`,
  under: (asset: string, line: string) => `${asset} UNDER ${line}`,
  noLine: (asset: string) => `${asset} VS THE OPENING PRINT`,
  winsIf: (asset: string, side: "up" | "down") => `Wins if ${asset} closes ${side === "up" ? "at or above" : "below"} the line.`,
  youStake: "You stake",
  winIfLands: "Win if it lands",
  settlesIn: "Settles in",
  opensIn: "Opens in",
  settling: "Settling…",
  verify: "verify on the Tempo explorer ↗",
  portfolio: "Portfolio",
  another: "Place another",
  dismiss: "Dismiss",
} as const;
