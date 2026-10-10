/**
 * The docs' table of contents (S20, L-20): every page documents a surface that is live on Tempo testnet today (only
 * shipped surfaces, the L-20 rule); what is next is said to be next. `/privacy` and `/terms` share the docs layout.
 */
export interface DocsPage {
  href: string;
  title: string;
}

export interface DocsSection {
  title: string;
  pages: readonly DocsPage[];
}

export const DOCS_NAV: readonly DocsSection[] = [
  {
    title: "Get started",
    pages: [
      { href: "/docs", title: "Introduction" },
      { href: "/docs/account", title: "Your account and money" },
      { href: "/docs/one-tap", title: "One-tap trading" },
    ],
  },
  {
    title: "Trade",
    pages: [
      { href: "/docs/terminal", title: "The terminal" },
      { href: "/docs/windows", title: "Windows and lanes" },
      { href: "/docs/exits", title: "Closing and exits" },
      { href: "/docs/games", title: "Range, Moonshot, Parlay, Boost" },
    ],
  },
  {
    title: "Settle",
    pages: [
      { href: "/docs/settlement", title: "Prints and settlement" },
      { href: "/docs/fees", title: "Fees" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { href: "/docs/contracts", title: "Contracts on Moderato" },
      { href: "/docs/testnet", title: "Testnet notes" },
      { href: "/privacy", title: "Privacy" },
      { href: "/terms", title: "Terms" },
    ],
  },
];
