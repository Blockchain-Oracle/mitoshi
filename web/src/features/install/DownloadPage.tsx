// `/download` — the place to get the app (D-230, the owner's point 8), rebuilt from the Masayume 68f7a09 port: a short
// head (the seal, one headline, one line), then one card per way in — iPhone (TestFlight), Android (Google Play
// testing) and the web app — From 21st.dev 18105 shadcnspace/download-01 (see PlatformCard), what this device can act
// on first; QR codes for a desktop reader. The head is static; the cards read the request (store links, device) inside Suspense
// behind a skeleton of the shape a desk gets from this deployment's links (`waitShapes`; read when the shell is
// prerendered). Styles: `styles/download.css`, on tokens, both themes.
import { Suspense } from "react";
import { Seal } from "@/components/kit/Seal";
import "@/components/kit/kit.css";
import "@/styles/download.css";
import { readStoreRelease } from "@/lib/release";
import { waitShapes } from "./cards";
import { DOWNLOAD } from "./copy";
import { PlatformCardsWait } from "./PlatformCard";
import { PlatformCards } from "./PlatformCards";

export function DownloadPage() {
  return (
    <div className="get">
      <header className="get-head">
        <Seal size="sm" tilt={-8} className="get-seal" />
        <h1 className="get-title">
          {DOWNLOAD.heading.lead}
          <em>{DOWNLOAD.heading.em}</em>
        </h1>
        <p className="get-line">{DOWNLOAD.line}</p>
      </header>
      <Suspense fallback={<PlatformCardsWait shapes={waitShapes(readStoreRelease(process.env))} />}>
        <PlatformCards />
      </Suspense>
    </div>
  );
}
