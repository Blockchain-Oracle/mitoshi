// `/` — the landing, rebuilt in round 7 (the owner: "revamp it totally"): one cinematic dark world (21st.dev 11494's
// materials) — the split hero with three phones (the front one live), the tape of last signed prices, the features
// bento, How it works, the proof and the final call with the store buttons and QR, then the site footer. Every figure is
// read per request inside Suspense (the index, ops, the chain), so the hero's copy never waits on them; the only client
// code is the hero phone's island, loaded once the page is idle.
import { Suspense } from "react";
import { SHELL } from "@/lib/copy";
import { AppStores, StoresWait } from "@/features/landing/AppStores";
import { LandingFinal, LandingProof, ProofBody, SiteFooter } from "@/features/landing/LandingEnd";
import { LandingHero } from "@/features/landing/LandingHero";
import { CRYPTO_SPARKS, LandingBento, LandingHow, LandingTape, SparkList, STOCK_SPARKS, TapeWait } from "@/features/landing/LandingSections";
import "@/components/kit/kit.css";
import "@/styles/landing.css";
import "@/styles/landing-phone.css";
import "@/styles/landing-sections.css";
import "@/styles/store-badges.css";

export default function Landing() {
  return (
    <>
      <a className="skip-link" href="#content">{SHELL.skipLink}</a>
      <main id="content" tabIndex={-1} className="lp">
        <LandingHero />
        <Suspense fallback={<TapeWait />}>
          <LandingTape />
        </Suspense>
        <LandingBento
          crypto={<Suspense fallback={null}><SparkList symbols={CRYPTO_SPARKS} /></Suspense>}
          stocks={<Suspense fallback={null}><SparkList symbols={STOCK_SPARKS} /></Suspense>}
        />
        <LandingHow />
        <LandingProof body={<Suspense fallback={null}><ProofBody /></Suspense>} />
        <LandingFinal stores={<Suspense fallback={<StoresWait />}><AppStores /></Suspense>} />
        <SiteFooter />
      </main>
    </>
  );
}
