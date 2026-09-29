// Ported from Masayume 68f7a09:web/src/lib/copy.ts — surface labels for the shell. Brand strings live ONLY here (D-060,
// Q-019). Contract strings (blockers, diagnoses, verdicts) live in @cwf/core/copy; feature copy joins with its feature.
export * from "@cwf/core/copy";

/** Mitoshi 見通し — "outlook, forecast" (D-060). */
export const BRAND = {
  name: "Mitoshi",
  kanji: "見通し",
  romaji: "mitoshi",
  tagline: "see where it's going",
  description: "Prediction markets and stocks on Tempo. Call where a price closes, trade tokenized stocks, and click every receipt.",
  domain: "mitoshi.xyz",
} as const;

export const CONNECT = {
  connect: "Sign in",
  connecting: "Signing in…",
  wrongChain: "Wrong network",
  disconnect: "Sign out",
} as const;

/** The account menu — the reference's rows (`Header.tsx` L337–363) plus the trust surface (D-053). */
export const ACCOUNT_MENU = {
  open: "Open account menu",
  tradingAccount: "Trading Balance",
  wallet: "Wallet",
  portfolio: "Portfolio",
  settings: "Account & keys",
} as const;

export const BANNER = {
  wrongNetwork: (chainName: string) => `This wallet is on another network. The app runs on ${chainName}.`,
  switchTo: (chainName: string) => `Switch to ${chainName}`,
  switching: "Switching…",
} as const;

export const SHELL = {
  skipLink: "Skip to content",
  back: "Back",
  openApp: "Open the app",
  searchLabel: "Search destinations",
  searchPlaceholder: "Search: markets, stocks, games…",
  searchEmpty: (q: string) => `Nothing matches “${q}”.`,
  commandHint: "Jump to…",
  moreLabel: "More",
  moreTitle: `Everything in Mitoshi`,
  moreDescription: "Trade, build, verify, or learn — every destination has one home.",
  mobileNav: "Mobile primary navigation",
  primaryNav: "Primary navigation",
  allDestinations: "All Mitoshi destinations",
  themeToDark: "Switch to dark theme",
  themeToLight: "Switch to light theme",
  close: "Close",
} as const;

/** `?note=` lines a redirect carries (routing law: nothing 404s silently; a moved route says so). */
export const NOTES = {
  moved: "That page moved — you're on its new home.",
} as const;

export const NOT_FOUND = {
  eyebrow: "404",
  headline: "Nothing lives at this address.",
  body: "The link may be mistyped, or the page never existed. Nothing was changed on your account.",
  back: "Go to markets",
  suggestions: "Maybe you meant",
} as const;

export const MARQUEE = {
  label: "Live prices",
  /** The ticker never invents numbers (Agari): until the price relay streams, it says so. */
  waiting: "Live prices connect when the price relay streams",
  stale: "prices paused",
} as const;

export const APP_STRIP = {
  pitch: `${BRAND.name} installs as an app — tap to add it to your home screen`,
  get: "Get it",
  dismiss: "Dismiss",
} as const;

export const FOOTER = {
  tagline: `${BRAND.name} ${BRAND.kanji} · ${BRAND.tagline}`,
  disclosure: "Testnet. Not investment advice. Prices come from signed oracle feeds; receipts link to the chain.",
  links: { privacy: "Privacy", terms: "Terms", contact: "Contact", status: "Status", docs: "Docs" },
} as const;

export const BOOT = {
  checking: "Checking the chain…",
} as const;

export const SESSION_BANNER = {
  signedOut: "You're browsing. Sign in with a passkey to trade — one tap, no seed phrase.",
  signIn: "Sign in",
  restoring: "Restoring your session…",
} as const;
