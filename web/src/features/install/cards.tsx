// `/download`'s three cards as data (D-230): iPhone, Android and the web app for one device and one set of store links —
// pure, so the server wrapper (`PlatformCards`) only reads the request and every state is tested (`cards.test.tsx`). A
// store whose test link isn't set says it is coming and sends the reader to the web app, which installs today and leads
// the page then: the card carries no button at all, so nothing on it is dead.
import { Globe } from "lucide-react";
import { AndroidGlyph, AppleGlyph, PlayGlyph } from "@/components/icons/StoreGlyphs";
import { orderCards, type Platform, type PlatformId, type StoreRelease } from "@/lib/release";
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
    action: <StoreButton href={release.testflight} glyph={<AppleGlyph />} kicker={c.ready.kicker} store={c.ready.store} primary={primary} />,
    qr: { value: release.testflight, caption: c.ready.scan },
  };
}

function androidCard(release: StoreRelease, here: boolean, primary: boolean): PlatformCardProps {
  const c = DOWNLOAD.android;
  const base = { id: "android" as const, name: c.name, glyph: <AndroidGlyph /> };
  if (here) return { ...base, chip: DOWNLOAD.here.chip, tone: "here", line: DOWNLOAD.here.line, action: null, qr: null };
  if (!release.play) return { ...base, chip: c.pending.chip, tone: "soon", line: c.pending.line, action: null, qr: null };
  const t = release.play.track === "open" ? c.open : c.internal;
  return {
    ...base,
    chip: t.chip,
    tone: "live",
    line: t.line,
    action: <StoreButton href={release.play.url} glyph={<PlayGlyph />} kicker={t.kicker} store={t.store} primary={primary} />,
    qr: { value: release.play.url, caption: t.scan },
  };
}

function webCard(origin: string, inApp: boolean, primary: boolean): PlatformCardProps {
  const c = DOWNLOAD.web;
  return {
    id: "web",
    name: c.name,
    glyph: <Globe aria-hidden />,
    chip: c.chip,
    tone: "live",
    line: c.line,
    // Inside the phone app the web app is what's running: nothing to install.
    action: inApp ? null : <InstallCta primary={primary} />,
    qr: inApp ? null : { value: `${origin}/download`, caption: c.scan },
  };
}

/** The cards in this device's order: its own first when it can act on it, else the web app (`orderCards`). */
export function platformCards({ platform, inApp, release, origin }: CardsInput): PlatformCardProps[] {
  const order: PlatformId[] = orderCards(platform, inApp, release);
  // One accent action per page. On a desktop it is installing the web app — the one thing this device can do (the
  // stores' cards carry QR codes for a phone); on a phone it is the leading card's.
  const primary = (id: PlatformId) => (platform === "desktop" ? id === "web" : order[0] === id);
  const cards: Record<PlatformId, PlatformCardProps> = {
    ios: iosCard(release, inApp && platform === "ios", primary("ios")),
    android: androidCard(release, inApp && platform === "android", primary("android")),
    web: webCard(origin, inApp, primary("web")),
  };
  return order.map((id) => cards[id]);
}
