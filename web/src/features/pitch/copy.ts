/**
 * The folio's words (Masayume 52a86fc:web/src/features/pitch/copy.ts's shape) — three slides for a live showcase: who
 * is talking, the one idea (which doubles as the map of the walkthrough), and what comes next. Every claim is on
 * Mitoshi's own evidence, and only what is live is said to be (D-094):
 * - press → position 0.64 s with no prompt: `docs/plan/acceptance/S23.md` pass 5 (tap-latency 38033450444, p50 643 ms);
 * - exits that run with the app closed: S24's gate (`acceptance/S24.md`);
 * - Range, Moonshot, Parlay, Boost on the book: S10, S23 passes 1 and 4 (receipts status 1);
 * - a Window pays on its signed RedStone print: the settler (S3, `acceptance/S3.md`);
 * - the stock pools and their guard deployed on Moderato (`packages/clients` deployments: `pools`, `guard`, `stocks`).
 */
export const PITCH = {
  brand: "mitoshi",
  builtOn: "Built on Tempo",
  prev: "prev",
  next: "next",
  slideLabel: (n: number) => `slide ${n}`,

  hello: {
    section: "HELLO",
    kicker: "Tempo · Crypto World's Fair",
    h1a: "Tempo gave money",
    h1b: "a ",
    emph: "passkey",
    lead: "Accounts that sign with your face, keys that sign for you inside limits, fees paid in dollars by whoever you choose. Trading on chain still felt like paperwork: a wallet, a gas token, a prompt for every click.",
    leadStrong: "So I built Mitoshi.",
    glanceTitle: "THE BUILDER",
    glanceBadge: "TEMPO TRACK",
    rows: {
      builder: ["Name", "Abubakr Jimoh"],
      alias: ["Also known as", "Blockchain Oracle"],
    },
  },

  idea: {
    section: "THE IDEA",
    kicker: "So the market is one screen",
    h1a: "One line.",
    h1b: "One ",
    emph: "tap",
    lead: "A live price, a Window that settles on a signed RedStone print, and two buttons. Sign up with a passkey, arm one key, and every tap after it goes through with no prompt and the fee sponsored.",
    cells: [
      ["Tap", "UP or DOWN on BTC, ETH, SOL and US stocks: your position shows 0.64 s after the press"],
      ["Close", "one tap sells at what the line shows; take-profit, stop-loss and trailing stops run with the app closed"],
      ["Play", "Range, Moonshot, Parlay and Boost, priced against the same order book"],
      ["Check", "every fill links to its Tempo receipt; a Window pays only on its signed print"],
    ] as const,
    foot: "LIVE ON TEMPO · LET ME SHOW YOU",
  },

  ahead: {
    section: "WHAT'S NEXT",
    kicker: "Where it goes from here",
    h1a: "Now. Next. ",
    emph: "Mainnet",
    now: { tag: "NOW", title: "On your phone", body: "Open mitoshi.xyz in your phone's browser, sign up with a passkey and tap. Nothing to install." },
    later: { tag: "NEXT", title: "In the stores", body: "The iPhone and Android apps, in TestFlight and Google Play testing now." },
    then: { tag: "THEN", title: "Mainnet", body: "The same contracts and keepers on Tempo mainnet, at the same address." },
    foot: "mitoshi.xyz",
  },
} as const;
