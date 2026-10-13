/**
 * The docs' table of contents (S20, L-20): every page documents a surface that is live on Tempo testnet today (only
 * shipped surfaces, the L-20 rule); what is next is said to be next. `/privacy` and `/terms` share the docs layout.
 * R4-10 (D-227): each section and page carries a one-line gist for /docs' accordion (Owarine's /legal frame).
 */
export interface DocsPage {
  href: string;
  title: string;
  gist: string;
}

export interface DocsSection {
  title: string;
  gist: string;
  pages: readonly DocsPage[];
}

export const DOCS_NAV: readonly DocsSection[] = [
  {
    title: "Get started",
    gist: "Sign up, add test dollars, tap.",
    pages: [
      { href: "/docs", title: "Introduction", gist: "What runs on testnet today." },
      { href: "/docs/account", title: "Your account and money", gist: "Passkey sign-in and pathUSD." },
      { href: "/docs/one-tap", title: "One-tap trading", gist: "No prompt per tap." },
    ],
  },
  {
    title: "Trade",
    gist: "The terminal, Windows and exits.",
    pages: [
      { href: "/docs/terminal", title: "The terminal", gist: "The line, UP and DOWN, CLOSE." },
      { href: "/docs/windows", title: "Windows and lanes", gist: "Cadences, 24/7 and stock hours." },
      { href: "/docs/exits", title: "Closing and exits", gist: "Take-profit, stop-loss, trailing." },
      { href: "/docs/games", title: "Range, Moonshot, Parlay, Boost", gist: "Priced on the same books." },
    ],
  },
  {
    title: "Settle",
    gist: "Signed prints, fees and proof.",
    pages: [
      { href: "/docs/settlement", title: "Prints and settlement", gist: "RedStone's signed open and close." },
      { href: "/docs/fees", title: "Fees", gist: "What a trade costs." },
      { href: "/docs/record", title: "The record and its proof", gist: "Re-verify any print yourself." },
    ],
  },
  {
    title: "Reference",
    gist: "Contracts, testnet notes, policies.",
    pages: [
      { href: "/docs/contracts", title: "Contracts on Moderato", gist: "Every address we deployed." },
      { href: "/docs/testnet", title: "Testnet notes", gist: "What differs from mainnet." },
      { href: "/privacy", title: "Privacy", gist: "What we keep, and why." },
      { href: "/terms", title: "Terms", gist: "Test dollars, no advice." },
    ],
  },
];
