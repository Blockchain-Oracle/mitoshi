/** `/activity` — Owarine 90a91d71 `features/activity/copy.ts` at its counts (R4-10, D-227). */
export const NOTICES = {
  title: "Activity",
  live: "Updated live",
  heading: "Your",
  headingAccent: "Activity",
  headingJp: "取引の記録。",
  lead: "Fills, verdicts and payouts.",
  inbox: "Inbox",
  notifications: { enable: "Turn on notifications", on: "Notifications on", blocked: "Notifications blocked" },
  settings: "Settings",
  signedOut: "Sign in to see what happened to your calls.",
  signIn: "Sign in",
  loading: "Reading your week…",
  error: "Can't read activity. Retrying.",
  empty: "Nothing this week.",
  trade: "Trade →",
  word: { filled: "Fill", won: "Won", lost: "Lost", void: "Void", follower: "Follower", take: "Take" },
  badge: (n: number) => `${n} new`,
} as const;

export const NOTICE_SETTINGS = {
  title: "Notifications",
  lead: "Choose what this device announces. Everything still lands in Activity.",
  activity: "Open Activity",
  browser: {
    title: "Browser notifications",
    granted: "On for this browser. Mitoshi only sends them while a tab is open.",
    default: "Off. Allow them to hear about your calls while Mitoshi is in another tab.",
    denied: "Blocked in this browser's site settings. Toasts still show while Mitoshi is open.",
    unsupported: "This browser can't show notifications. Toasts still show while Mitoshi is open.",
    allow: "Allow browser notifications",
  },
  topics: {
    title: "What to announce",
    rows: [
      { key: "money", label: "Money moved", hint: "Your calls settled your way or against you, and voids. On by default." },
      { key: "alerts", label: "Price alerts", hint: "A browser notification when one of your alerts fires; the toast always shows." },
      { key: "social", label: "Social", hint: "New followers, and takes by people you follow." },
      { key: "games", label: "Games", hint: "Duel invites and results, once games open." },
    ],
  },
  alerts: {
    title: "Price alerts on this device",
    empty: "No alerts yet. Open a market and tap the bell beside the chart.",
    open: "Open the terminal",
  },
} as const;
