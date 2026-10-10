/**
 * The words on link previews (L-23, Y-14): the landing's and the terminal's own lines, cut to what a card carries. The
 * face is Sora SemiBold: it has the minus sign, the middle dot and the em dash, but no kanji and no arrows, so none
 * reach a card (satori would otherwise fetch a fallback face at request time).
 */
export const OG_COPY = {
  honesty: "Tempo testnet · test pathUSD",
  site: {
    alt: "Mitoshi: call where a price closes on Tempo — crypto and US stocks in Windows settled on a signed oracle print.",
    eyebrow: "Prediction markets on Tempo",
    lead: "Call where a price",
    accent: "closes.",
    line: "BTC, ETH, SOL and US stocks. One passkey, one tap.",
  },
  ticker: {
    alt: "A Mitoshi terminal: the asset, its last signed print and Up or Down.",
    eyebrow: "Terminal",
    question: "Up or Down?",
    lastPrint: (when: string) => `Last signed print · ${when} UTC`,
    noPrint: "Windows that settle on a signed oracle print.",
  },
  window: {
    alt: "A Mitoshi Window's proof: its verdict and the signed prints that decided it.",
    eyebrow: "Proof",
    open: "Still open",
    up: "UP won",
    down: "DOWN won",
    void: "Voided · every stake returned",
    closed: (price: string, when: string, signers: number) => `Closed ${price} at ${when} UTC · ${signers} signers`,
    reverify: "Re-verify it in your browser.",
    unknown: "This Window isn't in the index.",
    /** The index was slow or down when the card was drawn: say what the page holds, not that the Window is missing. */
    unread: "Both signed prints and its verdict, re-verifiable in your browser.",
  },
} as const;
