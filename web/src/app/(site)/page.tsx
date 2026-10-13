// `/` — the landing (R4-13a, D-227; Ported from Owarine 90a91d71:web/src/features/landing/LandingPage.tsx): the sky
// hero with the live terminal on a phone in the first screen, the tape of what is open now, the three steps, what
// trades (each kind's Windows open), every close signed (the last settled Windows → their proofs), and the line again.
// Every section is a server component; the figures are the index's, read per request inside Suspense, so the hero (the
// LCP) never waits on them. Only the phone (an iframe of /trade/BTC, mounted on screen), the tape's slider and the
// theme toggle are client islands.
import { Suspense } from "react";
import { SHELL } from "@/lib/copy";
import { LandingFinal, LandingProof } from "@/features/landing/LandingEnd";
import { LandingHero } from "@/features/landing/LandingHero";
import { LandingLoop, LandingMarkets, LandingMarketsWait, LandingTape } from "@/features/landing/LandingSections";
import "@/components/kit/kit.css";
import "@/styles/landing.css";

export default function Landing() {
  return (
    <>
      <a className="skip-link" href="#content">{SHELL.skipLink}</a>
      <main id="content" tabIndex={-1} className="lp">
        <LandingHero />
        <Suspense fallback={<div className="lp-tape" aria-hidden />}>
          <LandingTape />
        </Suspense>
        <LandingLoop />
        <Suspense fallback={<LandingMarketsWait />}>
          <LandingMarkets />
        </Suspense>
        <Suspense fallback={null}>
          <LandingProof />
        </Suspense>
        <LandingFinal />
      </main>
    </>
  );
}
