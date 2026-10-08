// Ported from Masayume 68f7a09:web/src/features/games/moonshot/copy.ts — facts adapted to Tempo (the engine's signed
// close print, the range reserve's model, no fees on the CTA line).
import { RANGE_NOT_DEPLOYED, type MoonshotDirection } from "@cwf/core/range";

/**
 * Moonshot — Pips' direction-and-reach call (`moonshot.tsx`: "scroll up to go LONG, down to go SHORT, and
 * the further you scroll the bigger the target and the multiple") in Yosuku's words, with the facts of the
 * venue: the level is solved by the house's Range model on the live reserve, it settles on the Window's
 * own oracle print, and the whole payout is set aside up front. Nothing here is a chart line or an estimate:
 * the level, the odds and the multiple are the contract's own.
 */
export const MOONSHOT = {
  title: "Moonshot",
  eyebrow: "Call the side · dial the reach",
  sections: {
    aim: { number: "01", title: "Take aim", desc: "Pick a Window, call long or short, and dial how far the print has to travel. Further pays more." },
    rounds: { number: "02", title: "Your rounds", desc: "Each round settles on the Window's closing print. Claim the instant it lands." },
    how: { number: "03", title: "How a moonshot pays" },
  },
  how: [
    { n: "①", t: "The reach is the multiple", d: "×5 means the house solves a level the print has to finish past for the round to pay five times your stake. Further out is less likely, and pays more." },
    { n: "②", t: "One level, one print", d: "Long wins if the Window closes at or above the level; short if it closes at or below it. The Window's signed print decides — the same one its Up/Down settles on." },
    { n: "③", t: "The same house, aimed one way", d: "The level comes from where the book sits and how much the asset moves in the time left: the Range model with one edge open. The full payout is set aside up front." },
  ],
  notDeployed: {
    eyebrow: "Moonshot",
    title: "Moonshot",
    body: "Call a side and a multiple; the house solves the level that pays it. This is never mapped onto an ordinary up/down position — it needs the reserve that funds the payout.",
    why: RANGE_NOT_DEPLOYED,
  },
  aim: {
    label: "Aim",
    /** Pips' first-run line, in the ladder's own terms. */
    must: "Up is long, down is short. Further out pays more.",
    ladder: "Reach — up for long, down for short",
    long: "Long",
    short: "Short",
    rung: (multiple: number) => `×${multiple}`,
    valueText: (direction: MoonshotDirection, multiple: number) => `${direction === "long" ? "long" : "short"} ×${multiple}`,
    /** Pips' footer: "Further reach, bigger multiple". */
    hint: "Further reach, bigger multiple.",
    up: "Reach further long",
    down: "Reach further short",
  },
  builder: { yourWindow: "Your Window" },
  ticket: {
    title: "Ticket",
    tag: "moonshot",
    pays: "Pays",
    needWindow: "Pick a Window to take aim.",
    odds: (pct: string, direction: MoonshotDirection, strike: string) => `${pct}% chance it finishes ${direction === "long" ? "above" : "below"} ${strike}`,
    setStake: "Set stake",
    setPayout: "Set payout",
    youPay: "You pay",
    youWin: "You win",
    wallet: (balance: string, symbol: string) => `Wallet: ${balance} ${symbol}`,
    ifLands: "If the print finishes past the level",
    profit: (amount: string, symbol: string) => `${amount} ${symbol} profit if it lands`,
    retry: "Retry",
    placing: "Firing…",
    placed: "Moonshot placed!",
    pricing: "Solving…",
    unavailable: "Quote unavailable",
    insufficient: (symbol: string) => `Insufficient ${symbol}`,
    /** The reserve's caps would refuse this round; the line above the button says which. */
    wontFit: "Won't fit this expiry",
    place: (stake: string, symbol: string) => `Fire · ${stake} ${symbol}`,
    build: "Take aim",
    /** The solved level, as the round will be read back: "long · above $76,803". */
    target: (direction: MoonshotDirection, strike: string) => (direction === "long" ? `long · above ${strike}` : `short · below ${strike}`),
    distance: (pct: string, above: boolean) => `${pct}% ${above ? "above" : "below"} the opening print`,
    /** The open's cap is the quote plus a small headroom; the contract charges the exact stake at that second. */
    upTo: (amount: string, symbol: string) => `Up to ${amount} ${symbol} if the basis moves before it lands — the multiple on the slip is the real one.`,
    capRung: (multiple: number, cap: string, symbol: string) => `Payout on ×${multiple} is capped at ${cap} ${symbol}.`,
    capContract: (cap: string, symbol: string) => `Payout up to ${cap} ${symbol}, the reserve's cap.`,
    /** A payout typed over the rung's cap is not sent to the chain; one tap sets it to the cap. */
    overCap: (multiple: number, cap: string, symbol: string) => `×${multiple} pays at most ${cap} ${symbol}`,
    useCap: "Set to the cap",
    /** "Set stake" hit the cap: the contract charges the cap's stake, not the stake typed. */
    cappedStake: (stake: string, cap: string, symbol: string) => `The cap is reached: ${stake} ${symbol} buys the full ${cap}, and the rest of your stake stays in your wallet.`,
    locks: (amount: string, symbol: string) => `This round locks ${amount} ${symbol} of the house's money.`,
    expiryRoom: (room: string, cap: string, symbol: string) => `This expiry can still lock ${room} of ${cap} ${symbol}.`,
    expiryReading: "Reading the expiry's budget…",
    footnote: "The full payout is set aside up front. No fees to pay: your stake leaves your wallet, the network fee is covered.",
    place2: (stake: string, payout: string) => `Hold to fire ${stake} → ${payout}`,
    direction: "Direction",
    level: "The level it must finish past",
    reach: "Reach",
    reserve: (liquid: string, symbol: string, utilizationPct: string) => `Reserve: ${liquid} ${symbol} liquid · ${utilizationPct}% in play`,
    reservePaused: "The reserve is paused: no new rounds until it reopens. Settlement and claims still run.",
    technical: "technical details",
    tryAgain: "Try again",
    viewTx: "View the transaction",
    toast: (target: string, stake: string, payout: string, symbol: string) => `Moonshot placed. ${target}: ${stake} to ${payout} ${symbol} if it lands.`,
    requote: (stake: string, symbol: string) => `The basis moved — this call now costs ${stake} ${symbol}. Confirm again to place it at the new price.`,
  },
  slip: {
    connected: "No moonshots yet. Take aim above",
    disconnected: "Connect to see your rounds",
  },
} as const;
