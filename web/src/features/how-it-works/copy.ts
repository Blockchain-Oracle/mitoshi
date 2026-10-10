// Ported from Masayume 68f7a09:web/src/features/how-it-works/copy.ts — the reference's section labels and order, with
// Mitoshi's facts (L-12): dollars on Tempo, no fees, a tie goes UP.
export const HOW_IT_WORKS = {
  title: "How It Works",
  lead: "Call where a price closes. Tap UP or DOWN in dollars on Tempo. Settled on a signed print.",
  back: "Back to the terminal",
  sections: {
    steps: "Getting Started",
    example: "Payout Example",
    mechanics: "Key Mechanics",
    pricing: "How a Price Is Made",
    fees: "Fee Structure",
    settlement: "Settlement Process",
    architecture: "On-Chain Architecture",
    faq: "FAQ",
  },
  /** An editorial example is labelled as one, never shown as a live quote. */
  exampleTag: "Worked example — not a live quote",
  example: {
    up: "UP price",
    down: "DOWN price",
    max: "Pays per contract",
    buy: "You stake",
    contracts: "$6.40 on UP at 64¢ — 10 contracts",
    outcome: "BTC closes at or above the line",
    get: "You get",
    payout: "$10.00",
    profit: "(+$3.60, no fees)",
  },
  formula: {
    identity: "price(DOWN) = $1 − price(UP)",
    cost: "cost = contracts × price",
    payout: "payout if right = contracts × $1.00",
  },
  /** The pricing card's prose (the reference kept it in the component). */
  pricing: {
    body: "Nothing here is modelled. The price of UP is the best offer resting on the Window's book, in tenths of a cent — which is also the market's probability. DOWN is the same book seen from the other side. The makers quoting it price around a fair-value model of the spot, and any order can rest beside theirs.",
    foot: "Every quote is read off the live book for your exact stake, so the cost you see is the cost the book would charge now. Taps go in immediate-or-cancel at a protective limit: what crosses fills, the rest is cancelled, and the escrow locked at that limit is the most a fill can ever cost.",
  },
  cta: {
    title: "Ready to call it?",
    body: "Sign up with a passkey, take testnet dollars from the faucet, and tap.",
    action: "Open the terminal",
  },
} as const;
