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
  /** Owarine's `.tk-amount-unit` after the figure (R4-3, D-227). */
  unit: "USD",
  currentCost: "Current cost",
  ret: "Return",
  maxLoss: "Max loss",
  liveOdds: "Live market odds",
  enterAmount: "Enter an amount to quote",
  gettingQuote: "Getting live quote…",
  requoting: "requoting…",
  partial: (fillableText: string) => `Fills up to ${fillableText}; the rest stays.`,
  /** One tap to the size the book fills now (D-230). */
  useFillable: (fillableText: string) => `Stake ${fillableText} — fills now`,
  quoteFailed: (why: string) => `Quote failed: ${why}`,
  chance: (pct: number) => `${pct}% chance`,
  buy: (side: string) => `Buy ${side} for`,
  buyPlain: "Buy",
  /** Why the sign-in opened, under its title (D-224): "to place UP · $25.00". */
  signInFor: (side: string, amount: string) => `to place ${side} · ${amount}`,
  booked: (contractsText: string, side: string, avgPriceBps: number) => `Bought ${contractsText} ${side} contracts at ${Math.round(avgPriceBps / 100)}¢`,
  bookedPrefix: "Bought",
  bookedAt: "at",
  rolledBack: "The call did not go through — nothing was taken.",
  nothingFilled: "Nothing filled — the book moved. Nothing was taken.",
  requotePrefix: "The book moved — it now costs up to",
  requoteSuffix: "Confirm again to buy at the new price.",
  txLabel: "entry tx",
  syncing: "Syncing the chain clock…",
  close: "Close",
  /** "No fees to pay" is true on Tempo and says so on the CTA line (§2.1.4). */
  footnote: "Settles on its own, right on the price.",
  footnoteArmed: "No prompt · settles on its own.",
  footnotePasskey: "One passkey confirm · settles on its own.",
  creditNote: (creditText: string) => `${creditText} payout credit is spent first.`,
  advanced: (fromCadence: string, toCadence: string) => `Moved to the next ${toCadence} Window — side and stake kept.`,
  srCost: (costText: string) => `Cost ${costText}`,
  gate: {
    topUp: "Top up to place this",
    holds: (have: string) => `Your account holds ${have}.`,
    need: (need: string) => `Add ${need} more to place this.`,
    empty: "Get test dollars to place one.",
    addMoney: "Add money",
  },
  openCall: (side: string) => `Your call · ${side}`,
  openCallPlain: "Open your call",
  /** A Listed Window (pre-open, D-088): the call rests at the confirmed limit until the open print lands. */
  scheduled: {
    note: (opens: string) => `Opens ${opens} · fills at your price`,
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
  modeDirection: "Up/Down",
  modeRange: "Range",
  modeBoost: "Boost",
  routeLabel: "Place this bet",
  routePublic: "Public",
  routePrivate: "Private",
  rangePending: "Range needs the RangeReserve — not deployed yet.",
  leverageLabel: "Leverage",
  leveragePending: (multiple: string) => `${multiple} needs the leverage reserve — not deployed yet.`,
  /** Why 2×/3× can't be chosen here (Owarine `lockedReason`, R4-3 D-227). */
  leverageCapped: (multiple: string, max: string) => `${multiple} is over the reserve's ${max} cap`,
  leverageListed: "Boost opens with the Window",
  leveragePrivate: "Private bets are 1×",
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
