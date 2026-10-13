/**
 * The landing's words (R4-13a, D-227; Ported from Owarine 90a91d71:web/src/features/landing/words.ts, at its word count).
 * Every claim is something Mitoshi does today on Tempo testnet (D-094). Numbers on the page — Windows open per kind,
 * signed prints, settled Windows, the index's counts — are read from the index per request (`board.ts`), never written
 * here.
 */
export const WORDS = {
  nav: { markets: "Markets", how: "How it works", docs: "Docs", start: "Start trading", home: "Mitoshi home" },
  hero: {
    kicker: "On Tempo testnet",
    title: ["See where", "it's going.", "Call the close."],
    line: "Up or down in minutes. Close in one tap.",
    assets: ["BTC", "ETH", "SOL", "TSLA", "NVDA"],
    assetsLabel: "Some of the markets",
    start: "Start trading",
    paper: "Try it on paper",
    stickers: { passkey: "Passkey · no seed", oracle: "RedStone signs the close" },
    frameTitle: "Mitoshi's terminal, live",
  },
  tape: { label: "Live now", open: (n: number) => `${n} open`, print: "last signed" },
  loop: {
    kicker: "How it works",
    title: "Tap. Watch. Bank it.",
    steps: [
      { n: "01", title: "Sign up", body: "Face ID or a fingerprint. No seed phrase.", art: "key" },
      { n: "02", title: "Arm one tap", body: "One more tap, then no prompts.", art: "bell" },
      { n: "03", title: "Call it", body: "Close any time, or let it settle.", art: "moneyBag" },
    ],
  },
  markets: {
    kicker: "Everything on one screen",
    title: "Crypto and stocks. Same two buttons.",
    open: (n: number) => `${n} Window${n === 1 ? "" : "s"} open`,
    reading: "Index unavailable",
    cards: {
      crypto: { title: "Crypto", body: "BTC, ETH, SOL. 24/7.", href: "/trade/BTC" },
      stocks: { title: "Stocks", body: "Regular hours and 24/7.", href: "/markets" },
      parlay: { title: "Parlay", body: "Two or three Windows. The odds multiply.", href: "/parlay" },
      games: { title: "Games", body: "Range, Moonshot, Duel. Same prices.", href: "/games" },
    },
  },
  proof: {
    kicker: "Settled in public",
    title: "Every close is signed.",
    body: "RedStone signs each closing print. Anyone can check it.",
    settled: "Just settled",
    none: "No settled Window indexed yet.",
    reading: "Index unavailable",
    outcome: { up: "UP won", down: "DOWN won", void: "Voided" },
    proof: "Proof",
    closed: (when: string) => `closed ${when} UTC`,
    figures: { opened: "Windows opened", resolved: "Settled on a print", open: "Open now" },
  },
  final: { title: ["One line.", "One tap."], start: "Start trading", demo: "Watch it work" },
} as const;
