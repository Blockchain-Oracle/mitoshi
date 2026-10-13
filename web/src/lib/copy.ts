// Ported from Masayume 68f7a09:web/src/lib/copy.ts — surface labels for the shell. Brand strings live ONLY here (D-060,
// Q-019). Contract strings (blockers, diagnoses, verdicts) live in @cwf/core/copy; feature copy joins with its feature.
export * from "@cwf/core/copy";

/** Mitoshi 見通し — "outlook, forecast" (D-060). */
export const BRAND = {
  name: "Mitoshi",
  kanji: "見通し",
  romaji: "mitoshi",
  tagline: "see where it's going",
  description: "Call where a price closes, on Tempo: BTC, ETH, SOL and US stocks in Windows, a passkey to sign up and one tap to trade, every receipt on chain.",
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
  wrongNetwork: (chainName: string) => `Wrong network — this app runs on ${chainName}.`,
  switchTo: (chainName: string) => `Switch to ${chainName}`,
  switching: "Switching…",
} as const;

export const SHELL = {
  skipLink: "Skip to content",
  back: "Back",
  openApp: "Open the app",
  searchLabel: "Search destinations",
  searchPlaceholder: "Search markets and pages",
  /** More's pinned foot (R6 shell S17). */
  soundOn: "Sound on",
  soundOff: "Sound off",
  about: "About Mitoshi",
  /** The palette's keycaps (R6 shell S05; Senryo `useModCombo`): ⌘ K on Apple, Ctrl K elsewhere. */
  searchKey: { apple: ["⌘", "K"], other: ["Ctrl", "K"] } as const,
  searchEmpty: "Nothing matches that.",
  /** The ⌘K palette (Owarine 90a91d71 `CommandPalette`; R4-8, D-227): sr-only title and description, the field's hint. */
  commandTitle: "Go to",
  commandDesc: "Jump to any market or page in Mitoshi",
  commandPlaceholder: "Where to? BTC, Tesla, Leaderboard…",
  commandGroups: { places: "Go to", trade: "Trade", stocks: "Stocks" },
  /** A listed destination whose surface is not connected yet (critic gap 18): reachable, marked. */
  soon: "Soon",
  moreLabel: "More",
  moreTitle: "More",
  mobileNav: "Mobile primary navigation",
  primaryNav: "Primary navigation",
  allDestinations: "All Mitoshi destinations",
  themeToDark: "Switch to dark theme",
  themeToLight: "Switch to light theme",
  close: "Close",
  // The rail, top line and dock (S22, D-189).
  railLabel: "Mitoshi",
  /** The rail's unread count on Portfolio (the inbox lives on /activity). */
  unread: (n: number) => `${n} new`,
  railNav: "Places",
  everything: "More",
  everythingHint: "Every other page",
  keyHint: (key: string) => `Press ${key}`,
  shortcuts: "Keyboard shortcuts",
  shortcutsBody: "No shortcut moves money.",
  shortcutRows: [
    ["1 – 6", "Trade, Markets, Portfolio, Games, Automate, Leaderboard"],
    ["⌘ K  or  /", "Search markets and pages"],
    ["?", "This list"],
    ["Esc", "Close the open drawer or dialog"],
  ] as readonly (readonly [string, string])[],
  tradeSub: { label: "Trade", markets: "Markets", history: "History & stats", settings: "Trade settings" },
  privacyHide: "Hide balances",
  privacyShow: "Show balances",
  masked: "••••",
  privacyHidden: "Hidden",
  /** The kit CountdownRing's name for assistive tech ("4:05 left"). */
  timeLeft: (t: string) => `${t} left`,
  legal: "Legal",
  legalNav: "App, docs and legal",
  /** The rail foot's short way to /download (D-230); its title says it in full. */
  railApp: "App",
  health: { healthy: "All systems live", waiting: "Waiting", degraded: "Running degraded", unreachable: "Status unreachable", unread: "Checking…" },
  /** The chip's worst tone alone ("2 behind"), the words /status tallies with (T15). */
  healthTally: { bad: "down", warn: "behind", wait: "waiting" },
  /** The top line's health chip names the chain; the network itself is said once, by the mode plate (D-228). */
  network: "Tempo",
  /** The rail's money tile (O-10). */
  moneyLabel: "Balance",
  demoLabel: "Demo · paper dollars",
  /** The phone's mode chip (Owarine `ModeChip`; P6, D-224). */
  modeDemo: "DEMO",
  modeTestnet: "TESTNET",
  modeMainnet: "TEMPO",
  /** The rail's mode plate (Owarine `NetworkPlate`; R4-8): the world's hanko, its money, and where a tap goes. The one
   *  place the app names its network (D-228): the plate, the icon rail's stamp and the phone's chip are its three widths. */
  mode: {
    demo: { label: "DEMO", kanji: "練", line: "Paper dollars", hint: "Demo: paper dollars on live prices. Sign in to trade test dollars." },
    testnet: { label: "TESTNET", kanji: "試", line: "Test dollars", hint: "Tempo testnet: test dollars, nothing of value. Open the network's status." },
  },
  addMoney: "Add money",
} as const;

/** `?note=` lines a redirect carries (routing law: nothing 404s silently; a moved route says so). */
export const NOTES = {
  moved: "That page moved — you're on its new home.",
} as const;

/** The 404 (Owarine 90a91d71 `NotFoundScreen`; R4-0, D-227): a page that isn't there, told as a Window that voided. */
export const NOT_FOUND = {
  pageTitle: "Not found",
  title: "404",
  void: "VOID",
  line: "No print for this page, so it voided. Nothing was lost.",
  window: "Window",
  print: "Open print",
  missing: "missing",
  result: "Result",
  refunded: "void · refunded",
  markets: "Go to markets",
  home: "Home",
  search: "Search",
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
  disclosure: "Not investment advice. Prices come from signed oracle feeds; receipts link to the chain.",
  links: { app: "Get the app", privacy: "Privacy", terms: "Terms", contact: "Contact", status: "Status", docs: "Docs" },
} as const;

export const BOOT = {
  checking: "Checking the chain…",
} as const;

