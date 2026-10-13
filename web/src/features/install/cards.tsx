// `/download`'s three cards as data (D-230): iPhone, Android and the web app for one device and one set of store links —
// pure, so the server wrapper (`PlatformCards`) only reads the request and every state is tested (`cards.test.tsx`). A
// store whose test link isn't set says it is coming and sends the reader to the web app, which installs today and leads
// the page then: the card carries no button at all, so nothing on it is dead. Play's internal test is an invitation
// (only listed testers can open it), so its card is quiet — a quiet chip and a quiet button, after the web app — and
// never leads or takes the accent.
import { Globe } from "lucide-react";
import { AndroidGlyph, AppleGlyph, PlayGlyph } from "@/components/icons/StoreGlyphs";
import { orderCards, type Platform, type PlatformId, type StoreRelease } from "@/lib/release";
import type { InstallHint } from "./browser";
import { DOWNLOAD } from "./copy";
import { InstallCta } from "./InstallCta";
import { StoreButton, type PlatformCardProps } from "./PlatformCard";

export interface CardsInput {
  platform: Platform;
  /** Inside the phone app's own web view. */
  inApp: boolean;
  release: StoreRelease;
  /** The app's origin, for the web card's QR (`/download` on a phone). */
  origin: string;
  /** Where this browser keeps "install" when it holds no prompt (`browser.ts`). */
  hint: InstallHint;
}

function iosCard(release: StoreRelease, here: boolean, primary: boolean): PlatformCardProps {
  const c = DOWNLOAD.ios;
  const base = { id: "ios" as const, name: c.name, glyph: <AppleGlyph /> };
  if (here) return { ...base, chip: DOWNLOAD.here.chip, tone: "here", line: DOWNLOAD.here.line, action: null, qr: null };
  if (!release.testflight) return { ...base, chip: c.pending.chip, tone: "soon", line: c.pending.line, action: null, qr: null };
  return {
    ...base,
    chip: c.ready.chip,
    tone: "live",
    line: c.ready.line,
    action: <StoreButton href={release.testflight} glyph={<AppleGlyph />} kicker={c.ready.kicker} store={c.ready.store} variant={primary ? "accent" : "ink"} />,
    qr: { value: release.testflight, caption: c.ready.scan },
  };
}

function androidCard(release: StoreRelease, here: boolean, primary: boolean): PlatformCardProps {
  const c = DOWNLOAD.android;
  const base = { id: "android" as const, name: c.name, glyph: <AndroidGlyph /> };
  if (here) return { ...base, chip: DOWNLOAD.here.chip, tone: "here", line: DOWNLOAD.here.line, action: null, qr: null };
  if (!release.play) return { ...base, chip: c.pending.chip, tone: "soon", line: c.pending.line, action: null, qr: null };
  const open = release.play.track === "open";
  const t = open ? c.open : c.internal;
  return {
    ...base,
    chip: t.chip,
    tone: open ? "live" : "invite",
    line: t.line,
    action: <StoreButton href={release.play.url} glyph={<PlayGlyph />} kicker={t.kicker} store={t.store} variant={!open ? "quiet" : primary ? "accent" : "ink"} />,
    qr: { value: release.play.url, caption: t.scan },
  };
}

function webCard(origin: string, inApp: boolean, primary: boolean, hint: InstallHint): PlatformCardProps {
  const c = DOWNLOAD.web;
  return {
    id: "web",
    name: c.name,
    glyph: <Globe aria-hidden />,
    chip: c.chip,
    tone: "live",
    line: c.line,
    // Inside the phone app the web app is what's running: nothing to install.
    action: inApp ? null : <InstallCta primary={primary} hint={hint} />,
    qr: inApp ? null : { value: `${origin}/download`, caption: c.scan },
  };
}

/** The cards in this device's order: its own first when anyone can install it, else the web app (`orderCards`). */
export function platformCards({ platform, inApp, release, origin, hint }: CardsInput): PlatformCardProps[] {
  const order: PlatformId[] = orderCards(platform, inApp, release);
  // One accent action per page. On a desktop it is installing the web app — the one thing this device can do (the
  // stores' cards carry QR codes for a phone); on a phone it is the leading card's. The web card's accent holds only
  // while it is a real install (a prompt or Safari's steps), never a menu hint (`InstallCta`).
  const primary = (id: PlatformId) => (platform === "desktop" ? id === "web" : order[0] === id);
  const cards: Record<PlatformId, PlatformCardProps> = {
    ios: iosCard(release, inApp && platform === "ios", primary("ios")),
    android: androidCard(release, inApp && platform === "android", primary("android")),
    web: webCard(origin, inApp, primary("web"), hint),
  };
  return order.map((id) => cards[id]);
}

/** A card's outline for the skeleton: its words, whether it carries an action (and which), and its QR caption. */
export interface CardShape {
  id: PlatformId;
  name: string;
  chip: string;
  line: string;
  action: "install" | "store" | null;
  scan: string | null;
}

/**
 * The cards' outlines for `/download`'s skeleton, in a desk's order for these store links: the device is only known
 * with the request, the links are known with the deployment, so the static shell draws what a desk will get.
 */
export function waitShapes(release: StoreRelease): CardShape[] {
  return platformCards({ platform: "desktop", inApp: false, release, origin: "", hint: "other" }).map(({ id, name, chip, line, action, qr }) => ({
    id,
    name,
    chip,
    line,
    action: action === null ? null : id === "web" ? "install" : "store",
    scan: qr?.caption ?? null,
  }));
}
