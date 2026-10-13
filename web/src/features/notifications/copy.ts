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
