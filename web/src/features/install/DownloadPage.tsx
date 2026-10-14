// `/download` — the place to get the app (D-230, the owner's point 8; round 7: the phones and the stores up front). The
// head is a band in the landing's grammar: the title, the stores' own buttons (`StoreBadges`, the live release —
// TestFlight while Apple takes testers, Play's open test) and a QR for a desktop reader, beside three real
// captures of the app on 21st.dev 20020's phone frame. Then one card per way in (From 21st.dev 18105
// shadcnspace/download-01, see PlatformCard), what this device can act on first. The band's buttons and the cards read
// the request inside Suspense. Styles: `styles/download.css`, the phone and badge sheets.
import { connection } from "next/server";
import { Suspense } from "react";
import { StoreBadges } from "@/components/brand/StoreBadges";
import { Seal } from "@/components/kit/Seal";
import { QrCode } from "@/components/ui/qr-code";
import { PhoneFrame, PhoneShot } from "@/features/landing/hero/PhoneFrame";
import { webEnv } from "@/lib/env";
import { readStoreRelease } from "@/lib/release";
import { liveStoreRelease } from "@/server/store-release";
import "@/components/kit/kit.css";
import "@/styles/download.css";
import "@/styles/landing-phone.css";
import "@/styles/store-badges.css";
import { waitShapes } from "./cards";
import { DOWNLOAD } from "./copy";
import { PlatformCardsWait } from "./PlatformCard";
import { PlatformCards } from "./PlatformCards";

async function Stores() {
  await connection();
  return <StoreBadges release={await liveStoreRelease()} className="get-badges" />;
}

const SHOTS = [
  { name: "markets", side: "l" },
  { name: "trade", side: "c" },
  { name: "games", side: "r" },
] as const;

export function DownloadPage() {
  return (
    <div className="get">
      <header className="get-hero">
        <div className="get-hero-copy">
          <Seal size="sm" tilt={-8} className="get-seal" />
          <h1 className="get-title">
            {DOWNLOAD.heading.lead}
            <em>{DOWNLOAD.heading.em}</em>
          </h1>
          <p className="get-line">{DOWNLOAD.line}</p>
          <Suspense fallback={<div className="sb-row get-badges" aria-hidden><span className="skel sb-bone" /><span className="skel sb-bone" /></div>}>
            <Stores />
          </Suspense>
          <figure className="get-hero-qr">
            <QrCode value={`${webEnv.appOrigin}/download`} label={DOWNLOAD.qrLabel(DOWNLOAD.heroScan)} className="get-hero-qr-code" bgClassName="lp-qr-bg" inkClassName="lp-qr-ink" />
            <figcaption>{DOWNLOAD.heroScan}</figcaption>
          </figure>
        </div>
        <div className="get-phones" aria-hidden>
          {SHOTS.map((s) => (
            <div key={s.name} className="get-phone" data-side={s.side}>
              <PhoneFrame><PhoneShot name={s.name} alt="" eager={s.side === "c"} /></PhoneFrame>
            </div>
          ))}
        </div>
      </header>
      <Suspense fallback={<PlatformCardsWait shapes={waitShapes(readStoreRelease(process.env))} />}>
        <PlatformCards />
      </Suspense>
    </div>
  );
}
