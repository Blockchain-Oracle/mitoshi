// The app's store badges (round 7, the owner: the phone app front and centre — "the iOS logo, TestFlight, and they can
// download it"): From 21st.dev 8280 efferd/app-store-button (the mark beside a two-line label), drawn as 21st.dev
// 11494 cinematic-landing-hero's tactile pills: Apple's light, Android's dark. A store anyone can open today is a link
// (TestFlight's public link while Apple takes testers, Google Play's joinable test — `lib/release.ts`);
// one that isn't open yet keeps its badge, logo and name, with its honest status on it ("In Apple's
// review") and no link, so a reader never lands on a dead end. A server component: the release is read by the caller.
import { AppleGlyph, PlayGlyph } from "@/components/icons/StoreGlyphs";
import { ExternalLink } from "@/components/shell/ExternalLink";
import { DOWNLOAD } from "@/features/install/copy";
import type { StoreRelease } from "@/lib/release";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

const B = DOWNLOAD.badges;

function Badge({ store, href, glyph, kicker, name, status }: { store: "ios" | "android"; href: string | null; glyph: ReactNode; kicker: string; name: string; status?: string }) {
  // A store not open yet says so in its own top line ("In Apple's review" over "TestFlight") — no tag on top of it.
  const face = (
    <>
      <span className="sb-glyph" aria-hidden>{glyph}</span>
      <span className="sb-text">
        <small>{href ? kicker : (status ?? kicker)}</small>
        <b>{name}</b>
      </span>
    </>
  );
  if (href?.startsWith("/")) return <Link href={href} className={`sb sb--${store}`}>{face}</Link>;
  if (href) return <ExternalLink href={href} className={`sb sb--${store}`}>{face}</ExternalLink>;
  return (
    <span className={`sb sb--${store}`} data-state="wait" role="note" aria-label={B.waitLabel(name, status ?? "")}>
      {face}
    </span>
  );
}

export function IosBadge({ release }: { release: StoreRelease }) {
  return <Badge store="ios" href={release.testflight} glyph={<AppleGlyph />} kicker={B.ios.kicker} name={B.ios.name} status={release.inReview ? B.ios.review : B.ios.coming} />;
}

export function AndroidBadge({ release }: { release: StoreRelease }) {
  if (release.play) return <Badge store="android" href={release.playGroup ? "/download#android" : release.play} glyph={<PlayGlyph />} kicker={release.playGroup ? B.play.closed : B.play.kicker} name={B.play.name} />;
  return <Badge store="android" href={null} glyph={<PlayGlyph />} kicker={B.play.kicker} name={B.play.name} status={B.play.testing} />;
}

/** Both phones' badges, iPhone first. */
export function StoreBadges({ release, className }: { release: StoreRelease; className?: string }) {
  return (
    <div className={cn("sb-row", className)} role="group" aria-label={B.label}>
      <IosBadge release={release} />
      <AndroidBadge release={release} />
    </div>
  );
}
