// Ported from Masayume 68f7a09:web/src/features/install/copy.ts; rewritten for D-230 (the owner's point 8) at Owarine's
// word counts. Every sentence is about what exists now: the web app installs today; the iPhone and Android apps are
// offered only when anyone can join their test (`lib/release.ts`), and otherwise say they are coming, in one line, with
// the web app as the way in. No claim the phones haven't proven: passkey sign-in inside the phone app comes back to this
// page once a real phone has signed in there (docs-site `start/mobile-app`).

import type { InstallHint } from "./browser";

/** The browser install flow (`InstallCta`; the terminal's install sheet reads it too). */
export const INSTALL = {
  cta: {
    prompt: "Install Mitoshi",
    installing: "Opening the install sheet…",
    installed: "Installed · open it from your home screen",
    ios: "Add to Home Screen",
  },
  iosSteps: ["Open this page in Safari", "Tap Share — the square with the arrow", "Tap Add to Home Screen, then Add"],
  /**
   * Where a browser without an install prompt keeps it (`browser.ts`): its name, then the menu path, item by item. A
   * browser we can't vouch for gets no path — the browsers that install, or the phone.
   */
  where: {
    android: { in: "In your browser", path: [{ item: "Menu" }, { item: "Add to Home screen" }] },
    chrome: { in: "In Chrome", path: [{ item: "⋮", label: "Chrome menu" }, { item: "Cast, save, and share" }, { item: "Install page as app" }] },
    edge: { in: "In Edge", path: [{ item: "…", label: "Edge menu" }, { item: "Apps" }, { item: "Install this site as an app" }] },
    safari: { in: "In Safari", path: [{ item: "File" }, { item: "Add to Dock" }] },
  },
  elsewhere: "Install from Chrome, Edge or Safari, or scan the code with your phone.",
  /** The terminal's install sheet lists these under its button. */
  meta: [
    { label: "Web app", note: "installs from the browser" },
    { label: "iPhone and Android", note: "on Get the app" },
  ],
} as const;

/** The browsers whose install lives at a menu path (iOS has its steps; any other gets `INSTALL.elsewhere`). */
export type InstallWhere = keyof typeof INSTALL.where;

export function installWhere(hint: InstallHint): (typeof INSTALL.where)[InstallWhere] | null {
  return hint === "ios" || hint === "other" ? null : INSTALL.where[hint];
}

/** The hint as one line, for the terminal's sheet: "In Safari: File → Add to Dock." */
export function installWhereLine(hint: InstallHint): string {
  const where = installWhere(hint);
  return where ? `${where.in}: ${where.path.map((p) => p.item).join(" → ")}.` : INSTALL.elsewhere;
}

/** `/download` (D-230): one page for every way in, the device's own first. */
export const DOWNLOAD = {
  title: "Get the app",
  description: "Mitoshi on iPhone, Android or the web.",
  heading: { lead: "Mitoshi, ", em: "on your phone." },
  line: "iPhone, Android or the web.",
  ios: {
    name: "iPhone",
    ready: { chip: "TestFlight beta", line: "Install TestFlight, then join the beta.", kicker: "Join the beta on", store: "TestFlight", scan: "Scan with your iPhone" },
    pending: { chip: "Coming to TestFlight", line: "Add the web app to your Home Screen today." },
    /** The public link exists; Apple's beta review hasn't opened it yet. */
    review: { chip: "In Apple's beta review", line: "Opens here once Apple approves it. The web app installs today." },
  },
  android: {
    name: "Android",
    ready: { chip: "Open test", line: "Join the test, then install from Play.", kicker: "Join the Android test on", store: "Google Play", scan: "Scan with your Android phone" },
    pending: { chip: "Coming to Google Play", line: "Install the web app today." },
    apk: { chip: "Android app", line: "Download the app and open it to install.", kicker: "Download the", store: "Android app (APK)", scan: "Scan with your Android phone" },
  },
  web: { name: "Web app", chip: "Live", line: "Installs from your browser. No store.", scan: "Scan to open it on your phone" },
  here: { chip: "Installed", line: "You're using it now." },
  qrLabel: (what: string) => `QR code: ${what}`,
} as const;
