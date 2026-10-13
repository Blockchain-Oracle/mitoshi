// The app's own words (D-227, MOBILE): the offline screen only — every other word is the web's. At Owarine's counts;
// the reassurance is the web's error boundary's (packages/core copy ERROR_BOUNDARY), cut down.
export const OFFLINE = {
  offline: { title: "You're offline", body: "Mitoshi needs a connection. Your positions are safe on-chain." },
  down: { title: "Can't reach Mitoshi", body: "Your positions are safe on-chain." },
  retry: "Try again",
  retrying: "Trying…",
} as const;

/** The Face ID lock (round 7, Senryo's "Continue with Face ID"): the prompt the system shows, and the locked screen. */
export const LOCK = {
  title: "Mitoshi is locked",
  unlock: "Continue with Face ID",
  prompt: "Unlock Mitoshi",
  enablePrompt: "Use Face ID to open Mitoshi",
} as const;
