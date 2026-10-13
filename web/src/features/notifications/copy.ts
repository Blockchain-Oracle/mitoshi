/** `/activity` — Owarine 90a91d71 `features/activity/copy.ts` at its counts (R4-10, D-227). */
export const NOTICES = {
  title: "Activity",
  /** R6 money (T10): how old the data is, from the last read that answered — never "live" on a poll. */
  updated: (sec: number) => (sec < 60 ? `Updated ${sec} s ago` : sec < 3_600 ? `Updated ${Math.floor(sec / 60)} m ago` : `Updated ${Math.floor(sec / 3_600)} h ago`),
  heading: "Your",
  headingAccent: "Activity",
  headingJp: "取引の記録。",
  inbox: "Inbox",
  notifications: { enable: "Turn on notifications", on: "Notifications on", blocked: "Notifications blocked" },
  settings: "Settings",
  signIn: "Sign in to see yours",
  signInIntent: "to see your activity",
  /** The public settlement feed (signed out). */
  settled: {
    title: "Just settled",
    row: (symbol: string, cadence: string, outcome: "up" | "down" | "void") => (outcome === "void" ? `${symbol} ${cadence} · Void` : `${symbol} ${cadence} · ${outcome.toUpperCase()} won`),
    word: { up: "UP", down: "DOWN", void: "Void" } as Record<"up" | "down" | "void", string>,
    error: "Couldn't read settlements",
    retry: "Retry",
    empty: "Nothing settled yet.",
    makeCall: "Make a call",
  },
  error: "Couldn't read your activity",
  empty: "Nothing this week.",
  trade: "Trade →",
  word: { filled: "Fill", won: "Won", lost: "Lost", void: "Void", follower: "Follower", take: "Take" },
  badge: (n: number) => `${n} new`,
} as const;

export const NOTICE_SETTINGS = {
  title: "Notifications",
  browser: {
    title: "Browser",
    row: "Notifications",
    granted: "On · while a tab is open",
    default: "Off",
    denied: "Blocked in browser settings",
    unsupported: "Not supported here",
    allow: "Allow",
  },
  topics: {
    title: "Announce",
    rows: [
      { key: "money", label: "Money moved" },
      { key: "alerts", label: "Price alerts" },
      { key: "social", label: "Social" },
      { key: "games", label: "Games" },
    ],
  },
  alerts: {
    title: "Price alerts",
    empty: "No price alerts.",
    set: "Set one",
    foot: "Fires while Mitoshi is open",
  },
  /** The inbox, one tap from its settings (R6 money, S21: replaces the corner "Activity →"). */
  inbox: { title: "Inbox", row: "Inbox" },
} as const;
