/**
 * `/demo` (L-13) — Masayume 68f7a09:web/src/features/demo/copy.ts's shape, every claim rewritten to what Mitoshi does
 * on Tempo testnet. The video is named as not recorded until it exists (an honest state, never a dead embed); the
 * walkthrough below it is the product itself, its proofs real receipts (`proofs.ts`).
 */
export const DEMO = {
  title: "Demo",
  /** Set when the official demo is published (a YouTube id); until then the page says it is not recorded yet. */
  video: null as null | { title: string; watchUrl: string; embedUrl: string; length: string },
  videoPending: {
    title: "The demo video is being recorded",
    body: "Until it's up, everything it will show is below: the live product, dated captures of it, and the receipts.",
  },
  bar: {
    brand: "MITOSHI",
    sub: "/ demo",
    pitch: "pitch",
    open: "open the app",
  },
  hero: {
    eyebrow: "live demo",
    headline: "See Mitoshi ",
    headlineSerif: "work.",
    videoLabel: "▶ official demo · Tempo testnet",
    lead: "One screen for calling where a price closes: a passkey to sign up, one tap to trade, exits that run with the app closed, and a receipt for every move. Dated captures and on-chain proofs below.",
    open: "Open the app",
    pitch: "See the pitch",
  },
  traction: {
    opened: (n: string) => `${n} Windows opened`,
    resolved: (n: string) => `${n} resolved on their print`,
    live: "live on Tempo testnet",
  },
  sections: {
    tap: {
      kicker: "01 · one screen",
      headline: "One line. ",
      headlineSerif: "One tap.",
      body: "The line is the price; the Window on screen closes on RedStone's signed print. Pick UP or DOWN — the button says what a right call pays — and tap. After one biometric to arm, taps go through with no prompt and no fee to pay.",
      link: "open the terminal",
    },
    exits: {
      kicker: "02 · exits while you're away",
      headline: "Close it, or set it and ",
      headlineSerif: "walk away.",
      body: "CLOSE sells at what the line shows; 25, 50 or 75 % takes part of it off. Set take-profit, stop-loss or a trailing stop and a keeper sells it when it triggers — with the app closed.",
      link: "try it on a position",
    },
    record: {
      kicker: "03 · your record",
      headline: "Every trade, ",
      headlineSerif: "on the record.",
      body: "History keeps every closed round with lifetime P&L, win rate, streaks and volume; Activity lists the money moves. Each row opens its receipt on Tempo's explorer.",
      link: "see your history",
    },
    depth: {
      kicker: "04 · a real venue",
      headline: "A real order book under ",
      headlineSerif: "one button.",
      cards: {
        book: { title: "One book per Window", body: "A fully on-chain order book on Tempo. Your tap takes the resting price for your size, immediate-or-cancel; makers quote both sides." },
        prints: { title: "Signed prints", body: "Each Window opens and closes on RedStone's signed packages, verified by the engine on chain. A tie goes UP; no reliable print voids it at half." },
        vault: { title: "The maker vault", body: "Range, Moonshot and Parlay price against the depth the maker vault quotes around a fair-value model." },
      },
      proven: "deployed on Moderato",
    },
    verify: {
      kicker: "05 · don't trust it. verify it.",
      headline: "Real actions. ",
      headlineSerif: "Open receipts.",
      body: "Taps, a close, an exit sold by the keeper with the tab closed, a Range band and a Moonshot, each a transaction on Tempo testnet's explorer.",
      readOn: (date: string) => `Test-account receipts, each read on ${date}.`,
      contracts: "The contracts every Window runs on",
    },
  },
  close: {
    headline: "See where it's ",
    headlineSerif: "going.",
    footer: "Mitoshi 見通し · prediction markets on Tempo, one tap at a time.",
  },
  frame: {
    caption: (date: string) => `captured from the live testnet product · ${date}`,
    terminal: "Mitoshi's terminal, signed out: the BTC line, the Window's clock, and UP and DOWN with what each pays",
    position: "A position's details on a phone: what CLOSE pays now, Reduce by 25 / 50 / 75 %, CLOSE, TP / SL",
    history: "Trade history with the six stats: lifetime P&L, win rate, trades, win streak, best streak, volume",
  },
  /** Every capture under /public/demo was taken this day from the deployed product (states run 38034974579). */
  capturedOn: "2026-10-10",
} as const;
