// Ported from Masayume 68f7a09:web/src/features/install/copy.ts; rewritten for D-230 (the owner's point 8) at Owarine's
// word counts. Every sentence is about what exists now: the web app installs today; the iPhone and Android apps are
// offered only when their public test link is set (`lib/release.ts`), and otherwise say they are coming, in one line,
// with the web app as the way in.

/** The browser install flow (`InstallCta`; the terminal's install sheet reads it too). */
export const INSTALL = {
  cta: {
    prompt: "Install Mitoshi",
    installing: "Opening the install sheet…",
    installed: "Installed · open it from your home screen",
    ios: "Add to Home Screen",
    manual: "Install from your browser menu",
  },
  iosSteps: ["Open this page in Safari", "Tap Share — the square with the arrow", "Tap Add to Home Screen, then Add"],
  manualHint: "Use your browser's Install or Add to Home Screen.",
  /** The terminal's install sheet lists these under its button. */
  meta: [
    { label: "Web app", note: "installs from the browser" },
    { label: "iPhone and Android", note: "on Get the app" },
  ],
} as const;

/** `/download` (D-230): one page for every way in, the device's own first. */
export const DOWNLOAD = {
  title: "Get the app",
  description: "Mitoshi on iPhone, Android or the web.",
  heading: { lead: "Mitoshi, ", em: "on your phone." },
  line: "iPhone, Android or the web. One passkey for all three.",
  ios: {
    name: "iPhone",
    ready: { chip: "TestFlight beta", line: "Install TestFlight, then join the beta.", kicker: "Join the beta on", store: "TestFlight", scan: "Scan with your iPhone" },
    pending: { chip: "Coming to TestFlight", line: "Add the web app to your Home Screen today." },
  },
  android: {
    name: "Android",
    open: { chip: "Open test", line: "Join the test, then install from Play.", kicker: "Join the test on", store: "Google Play", scan: "Scan with your Android phone" },
    internal: { chip: "Invited testers", line: "Invited testers only. Everyone else: the web app.", kicker: "Testers, open it on", store: "Google Play", scan: "Scan with your Android phone" },
    pending: { chip: "Coming to Google Play", line: "Install the web app today." },
  },
  web: { name: "Web app", chip: "Live", line: "Installs from your browser. No store.", scan: "Scan to open it on your phone" },
  here: { chip: "Installed", line: "You're using it now." },
  qrLabel: (what: string) => `QR code: ${what}`,
  foot: "Same passkey, same account, same balance on each.",
} as const;
