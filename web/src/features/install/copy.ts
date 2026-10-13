// Ported from Masayume 68f7a09:web/src/features/install/copy.ts
/**
 * `/download` — the reference's `app/download/page.tsx`, its words truth-corrected for Mitoshi on Tempo: every
 * sentence is about what exists (the installable web app, passkeys, test dollars); the native builds are named as in
 * progress, never claimed.
 */
export const INSTALL = {
  title: "Get Mitoshi",
  eyebrow: "Mitoshi on your phone",
  titleLead: "Call it in ",
  titleEm: "ten seconds.",
  line: "Pick a side and a stake; paid on the close.",
  cta: {
    prompt: "Install Mitoshi",
    installing: "Opening the install sheet…",
    installed: "Installed · open it from your home screen",
    ios: "Add to Home Screen",
    manual: "Install from your browser menu",
  },
  iosSteps: ["Open this page in Safari", "Tap Share — the square with the arrow", "Tap Add to Home Screen, then Add"],
  manualHint: "Use your browser's Install or Add to Home Screen.",
  meta: [
    { label: "Web app", note: "installs from the browser, no store" },
    { label: "Test dollars", note: "real mechanics" },
    { label: "Native app", note: "iOS and Android builds are in progress" },
  ],
  points: [
    { title: "One passkey, no seed", body: "Sign in with your face or fingerprint. Test dollars arrive while you sign up, and there are no network fees to pay." },
    { title: "Windows all day", body: "Crypto Windows around the clock, stock Windows in market hours, and a weekend Gap for the Monday open." },
    { title: "Paid on the close", body: "Settlement reads the signed price at the boundary you watched. Win and it is paid to you automatically." },
  ],
  foot: "Beta on Tempo: test dollars, real settlement.",
  shotAlt: "Mitoshi on a phone: the home screen at phone size, captured from the running app.",
} as const;
