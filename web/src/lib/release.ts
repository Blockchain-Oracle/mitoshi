// Ported from Owarine 90a91d71:web/src/lib/release.ts (C10f) — the one config point for what `/download` links to but
// this repository can't publish by itself (D-230, the owner's point 8): the iPhone app's public TestFlight link and the
// Android app's Google Play testing link. Each is a runtime variable on the web app, read on the server per request, so
// a deployment turns a card from "Coming to …" into the real link by setting a value and restarting — no rebuild (the
// loading skeleton reads them when the shell is prerendered, so they are build variables too). The names are the ones
// the store ship step writes to `~/.config/mitoshi/stores.env` (`docs/plan/env-matrix.md`):
//
//   TESTFLIGHT_PUBLIC_LINK     https://testflight.apple.com/join/<code>
//   PLAY_OPEN_TEST_LINK        https://play.google.com/apps/testing/xyz.mitoshi.app.testnet (anyone can join)
//   PLAY_INTERNAL_TEST_LINK    https://play.google.com/apps/internaltest/<token> (invited testers; used only when no
//                              open test is set, and never leads or takes the accent: `storeOpen`)
//
// None is a secret and none is NEXT_PUBLIC_*. A malformed value counts as unset, so a card keeps saying it is coming
// rather than linking somewhere wrong. Pure (no server-only import) so the parsing is tested.

export type PlayTrack = "open" | "internal";

export interface StoreRelease {
  testflight: string | null;
  play: { url: string; track: PlayTrack } | null;
}

export type Platform = "ios" | "android" | "desktop";
/** `/download`'s cards. */
export type PlatformId = "ios" | "android" | "web";

type Env = Record<string, string | undefined>;

function httpsUrl(raw: string | undefined): URL | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Only Apple's own join links: a TestFlight invitation is never anywhere else. */
export function parseTestflight(raw: string | undefined): string | null {
  const url = httpsUrl(raw);
  return url && url.hostname === "testflight.apple.com" && /^\/join\/[A-Za-z0-9]+\/?$/.test(url.pathname) ? url.toString() : null;
}

const PACKAGE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;

/**
 * Only Google Play's own pages: for the open test, its opt-in page (`/apps/testing/<package>`) or the app's store page
 * (`/store/apps/details?id=<package>`); for the internal test, its invitation (`/apps/internaltest/<id>`).
 */
export function parsePlay(raw: string | undefined, track: PlayTrack): string | null {
  const url = httpsUrl(raw);
  if (!url || url.hostname !== "play.google.com") return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (track === "internal") return /^\/apps\/internaltest\/[A-Za-z0-9_-]+$/.test(path) ? url.toString() : null;
  const optIn = path.match(/^\/apps\/testing\/([^/]+)$/)?.[1];
  const listed = path === "/store/apps/details" ? url.searchParams.get("id") : null;
  const pkg = optIn ?? listed;
  return pkg && PACKAGE.test(pkg) ? url.toString() : null;
}

/**
 * Whether Apple's join page says the beta takes no one: a public link exists before Apple's beta review passes (and after
 * the tester limit is reached), and then it opens a page that says so — a dead end, never a page's lead action. The page
 * is HTML-escaped English (the request asks for en-US).
 */
export function testflightClosed(html: string): boolean {
  return /isn(?:'|’|&#39;|&#x27;|&apos;)t accepting any new testers|this beta is full/i.test(html);
}

export function readStoreRelease(env: Env): StoreRelease {
  const open = parsePlay(env.PLAY_OPEN_TEST_LINK, "open");
  const internal = open ? null : parsePlay(env.PLAY_INTERNAL_TEST_LINK, "internal");
  return {
    testflight: parseTestflight(env.TESTFLIGHT_PUBLIC_LINK),
    play: open ? { url: open, track: "open" } : internal ? { url: internal, track: "internal" } : null,
  };
}

/** The phone app's web view names itself in the user agent (mobile/src/shell/config.ts `USER_AGENT_MARK`). */
const SHELL_MARK = /\bCWFShell\//;

/**
 * The device a request comes from, for which card leads: an iPhone (or iPod; an iPad that says iPad), an Android
 * phone, or anything else. iPadOS Safari reports a Mac, so it reads as a desktop and still sees every card.
 */
export function platformOf(userAgent: string | null | undefined): { platform: Platform; inApp: boolean } {
  const ua = userAgent ?? "";
  const platform: Platform = /\b(iPhone|iPod|iPad)\b/.test(ua) ? "ios" : /\bAndroid\b/.test(ua) ? "android" : "desktop";
  return { platform, inApp: SHELL_MARK.test(ua) };
}

/**
 * A store anyone can open today: the public TestFlight link, or Google Play's open test. Play's internal test is an
 * invitation — Google shows it only to the accounts on its testers list, and everyone else lands on "not available" —
 * so it never leads a page and is never its accent action (D-230).
 */
export function storeOpen(release: StoreRelease, store: "ios" | "android"): boolean {
  return store === "ios" ? release.testflight !== null : release.play?.track === "open";
}

/**
 * `/download`'s cards in the order this device needs them (D-230): what this device can act on first. A phone sees its
 * own app first when anyone can install it (its store is open, or it is the app), else the web app — it installs today,
 * so the first screen always holds an action that works — then its own card, then the other phone's. A desktop sees the
 * open stores first (each with its QR), then the web app, then Play's invitation-only test, then the stores still
 * coming.
 */
export function orderCards(platform: Platform, inApp: boolean, release: StoreRelease): PlatformId[] {
  if (platform === "desktop") {
    const stores = ["ios", "android"] as const;
    const open = stores.filter((s) => storeOpen(release, s));
    const invited: PlatformId[] = release.play?.track === "internal" ? ["android"] : [];
    const coming = stores.filter((s) => !open.includes(s) && !invited.includes(s));
    return [...open, "web", ...invited, ...coming];
  }
  const other: PlatformId = platform === "ios" ? "android" : "ios";
  const ownReady = inApp || storeOpen(release, platform);
  return ownReady ? [platform, "web", other] : ["web", platform, other];
}
