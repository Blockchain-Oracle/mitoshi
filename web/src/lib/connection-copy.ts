// The connection notice's words (R6 shell S04/T04; Senryo's offline copy's tone), apart from the shared copy so the
// strip's lazy view and the offline-blocked sends carry them, not every route's first load.
export const CONNECTION = {
  offline: (at: string) => `Offline — prices paused ${at}`,
  reconnecting: "Prices reconnecting…",
  retrying: "Retrying…",
  retry: "Retry",
  blocked: "You're offline",
  announce: { offline: "Offline. Prices paused.", reconnecting: "Prices reconnecting.", live: "Prices live again." },
} as const;
