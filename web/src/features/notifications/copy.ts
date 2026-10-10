export const NOTICES = {
  title: "Activity",
  lead: "What happened to your calls this week, and around you: fills, settlements and voids, new followers, takes by people you follow.",
  signedOut: "Sign in to see what happened to your calls.",
  signIn: "Sign in",
  loading: "Reading your week…",
  error: "Your activity can't be read right now. It refreshes by itself.",
  empty: "Nothing yet this week. Make a call and it shows here.",
  trade: "Open the terminal",
  badge: (n: number) => `${n} new`,
} as const;
