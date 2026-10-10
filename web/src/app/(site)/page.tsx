// `/` — the landing (S20, L-11; plan C.3.7: Agari's landing, revamped to Tradash's grammar): one line, one button, then
// the live terminal on a phone below the fold, the two pillars at equal size, the steps, the indexer's own counts and
// the closing band. The hero is a server component whose headline is the LCP; the slot word, the phone and nothing
// else are client islands, the phone mounting only on screen. Every claim is something that exists (`features/landing`).
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { SlotHeadline } from "@/components/ui/slot-headline";
import { LANDING } from "@/features/landing/copy";
import { LandingPhone } from "@/features/landing/LandingPhone";
import { Cta, Figures, Pillars, Steps } from "@/features/landing/sections";
import { BRAND } from "@/lib/copy";
import "@/styles/landing.css";

const H = LANDING.hero;
const P = LANDING.phone;
const START = "/trade/BTC";

export default function Landing() {
  return (
    <div className="mx-auto flex max-w-(--content-wide) flex-col gap-20 px-gutter py-12 lg:gap-28 lg:px-gutter-desktop lg:py-20">
      <section className="flex flex-col gap-5">
        <span className="size-12 text-ink"><MitoshiMark /></span>
        <p className="type-label-micro text-ink-secondary">{BRAND.name} · <span lang="ja">{BRAND.kanji}</span> · {BRAND.tagline}</p>
        {/* `hero-lines` (styles/base.css) reserves the headline's line count, so the font swap moves nothing (D-152). */}
        <SlotHeadline prefix={H.prefix} joiner={H.joiner} items={H.assets} className="max-w-3xl hero-lines type-display text-ink" />
        <p className="max-w-2xl type-body text-ink-secondary">{H.lead}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href={START} className="inline-flex min-h-touch items-center gap-2 rounded-full bg-accent-fill px-6 type-body-strong text-on-accent!">
            {H.cta} <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link href="/how-it-works" className="type-body-strong text-ink underline-offset-4 hover:underline">{H.secondary}</Link>
        </div>
      </section>

      <section className="landing-defer grid items-center gap-10 md:grid-cols-2" aria-labelledby="phone-title">
        <div className="flex max-w-md flex-col gap-3">
          <span className="type-label-micro text-ink-secondary">{P.eyebrow}</span>
          <h2 id="phone-title" className="type-title text-ink">{P.title}</h2>
          <p className="type-body text-ink-secondary">{P.body}</p>
          <Link href={START} className="inline-flex items-center gap-1 type-body-strong text-ink underline-offset-4 hover:underline">
            {P.open} <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <LandingPhone src={START} title={P.frameTitle} />
      </section>

      <Pillars />
      <Steps />
      <Suspense fallback={null}>
        <Figures />
      </Suspense>
      <Cta />
    </div>
  );
}
