// Ported from Owarine 90a91d71:web/src/lib/release.ts (C10f) — the one config point for what `/download` links to but
// this repository can't publish by itself (D-230, the owner's point 8): the iPhone app's public TestFlight link and the
// Android app's Google Play open-test link. Each is a runtime variable on the web app, read on the server per request,
// so a deployment turns a card from "Coming to …" into the real link by setting a value and restarting — no rebuild.
// The names are the ones the store ship step writes to `~/.config/mitoshi/stores.env` (`docs/plan/env-matrix.md`):
//
//   TESTFLIGHT_PUBLIC_LINK   https://testflight.apple.com/join/<code> — offered only while Apple's join page takes
//                            testers (`server/store-release.ts`): before Apple's beta review passes it says it doesn't
//   PLAY_OPEN_TEST_LINK      https://play.google.com/apps/testing/<package>, or the app's store page — anyone can join
//   ANDROID_APK_LINK         https://expo.dev/artifacts/eas/<id>.apk — the same app as an APK anyone can install
//                            (round 7, the owner: Android had nothing to install while Play's open test waits)
//
// Play's internal test is not offered: its link opens only for the accounts on its testers list, and everyone else lands
// on "not available" — a dead end. Android says "Coming to Google Play" until the open test exists. None is a secret and
// none is NEXT_PUBLIC_*. A malformed value counts as unset, so a card keeps saying it is coming rather than linking
// somewhere wrong. Pure (no server-only import) so the parsing is tested.

/** The store links a visitor can open right now; null is "coming". */
export interface StoreRelease {
  testflight: string | null;
  play: string | null;
  /** The Android app as an installable APK (an EAS build), for Android before Play's open test exists. */
  apk?: string | null;
  /** A TestFlight link is set but Apple's beta review hasn't opened it yet (the card says so instead of "coming"). */
  inReview?: boolean;
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

const TESTFLIGHT_JOIN = /^\/join\/([A-Za-z0-9]+)\/?$/;

/** Only Apple's own join links: a TestFlight invitation is never anywhere else. */
export function parseTestflight(raw: string | undefined): string | null {
  const url = httpsUrl(raw);
  return url && url.hostname === "testflight.apple.com" && TESTFLIGHT_JOIN.test(url.pathname) ? url.toString() : null;
}

const PACKAGE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;

/**
 * Only Google Play's open test: its opt-in page (`/apps/testing/<package>`) or the app's store page
 * (`/store/apps/details?id=<package>`). The internal test's invitation (`/apps/internaltest/<id>`) is refused.
 */
export function parsePlay(raw: string | undefined): string | null {
  const url = httpsUrl(raw);
  if (!url || url.hostname !== "play.google.com") return null;
  const path = url.pathname.replace(/\/+$/, "");
  const optIn = path.match(/^\/apps\/testing\/([^/]+)$/)?.[1];
  const listed = path === "/store/apps/details" ? url.searchParams.get("id") : null;
  const pkg = optIn ?? listed;
  return pkg && PACKAGE.test(pkg) ? url.toString() : null;
}

/** What Apple's join page says about a beta: it takes testers, it doesn't, or it couldn't be read. */
export type TestflightState = "open" | "closed" | "unknown";

/**
 * Apple's answer for one join link, from the page it serves (HTML-escaped English; the request asks for en-US). Closed:
 * the page says the beta takes no one — before Apple's beta review passes, at the tester limit, or with the link
 * turned off — or the code is gone (404/410). Open: the join page for this code (it links `itms-beta://…/join/<code>`)
 * without that line. Anything else — a server error, another page — is unknown, never open.
 */
export function testflightState(link: string, status: number, html: string): TestflightState {
  if (status === 404 || status === 410) return "closed";
  if (status !== 200) return "unknown";
  if (/isn(?:'|’|&#39;|&#x27;|&apos;)t accepting any new testers|this beta is full/i.test(html)) return "closed";
  const code = TESTFLIGHT_JOIN.exec(new URL(link).pathname)?.[1];
  return code && html.includes(`itms-beta://testflight.apple.com/join/${code}`) ? "open" : "unknown";
}

const EAS_APK = /^\/artifacts\/eas\/[\w-]+\.apk$/;

/** Only an EAS build's own APK artifact: the app's release is never sideloaded from anywhere else. */
export function parseApk(raw: string | undefined): string | null {
  const url = httpsUrl(raw);
  return url && url.hostname === "expo.dev" && EAS_APK.test(url.pathname) ? url.toString() : null;
}

export function readStoreRelease(env: Env): StoreRelease {
  const release: StoreRelease = { testflight: parseTestflight(env.TESTFLIGHT_PUBLIC_LINK), play: parsePlay(env.PLAY_OPEN_TEST_LINK) };
  const apk = parseApk(env.ANDROID_APK_LINK);
  return apk ? { ...release, apk } : release;
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

/** A store anyone can open today: TestFlight's public link while Apple takes testers; Google Play's open test or the APK. */
export function storeOpen(release: StoreRelease, store: "ios" | "android"): boolean {
  return store === "ios" ? release.testflight !== null : release.play !== null || Boolean(release.apk);
}

/**
 * `/download`'s cards in the order this device needs them (D-230): what this device can act on first. A phone sees its
 * own app first when anyone can install it (its store is open, or it is the app), else the web app — it installs today,
 * so the first screen always holds an action that works — then its own card, then the other phone's. A desktop sees the
 * open stores first (each with its QR), then the web app, then the stores still coming.
 */
export function orderCards(platform: Platform, inApp: boolean, release: StoreRelease): PlatformId[] {
  if (platform === "desktop") {
    const stores = ["ios", "android"] as const;
    const open = stores.filter((s) => storeOpen(release, s));
    const coming = stores.filter((s) => !storeOpen(release, s));
    return [...open, "web", ...coming];
  }
  const other: PlatformId = platform === "ios" ? "android" : "ios";
  const ownReady = inApp || storeOpen(release, platform);
  return ownReady ? [platform, "web", other] : ["web", platform, other];
}
