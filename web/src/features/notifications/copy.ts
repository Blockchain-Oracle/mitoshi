export const NOTICES = {
  title: "Activity",
  lead: "Your fills, settlements and voids, and people you follow.",
  signedOut: "Sign in to see what happened to your calls.",
  signIn: "Sign in",
  loading: "Reading your week…",
  error: "Your activity can't be read right now. It refreshes by itself.",
  empty: "Nothing yet this week. Make a call and it shows here.",
  trade: "Open the terminal",
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
