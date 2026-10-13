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
  activity: "Activity →",
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
    empty: "None yet · add one from a chart's bell",
    foot: "Fires while Mitoshi is open",
  },
} as const;
