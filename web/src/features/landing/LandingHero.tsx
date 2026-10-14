// The first screen, rebuilt (round 7, the owner: "revamp it totally — the phone is the product", then "the phones closer
// to the top, nothing floating, don't say it twice"). From 21st.dev 11494 easemize/cinematic-landing-hero — its
// materials (the masked grid and film grain on a deep ground, the silver-matte headline, the huge brand wordmark behind
// the device, the tactile buttons) — composed as a split hero so the phones sit in the first screen: the copy and two
// actions on the left, three phones fanned on the right (the live terminal in front, real captures of Markets and Games
// behind). Dropped: GSAP and its 7,000 px pinned scroll (the site's 35 KB budget; no scroll-jacking), the floating
// badges, framer-motion, the blue card and its hex inks. Server component; the front phone's screen is live.
import { ArrowRight, Menu, Smartphone } from "lucide-react";
import Link from "next/link";
import { Seal } from "@/components/kit/Seal";
import { BRAND } from "@/lib/copy";
import { DOCS_URL } from "@/lib/docs-url";
import { HeroPhone } from "./hero/HeroPhone";
import { PhoneFrame, PhoneShot } from "./hero/PhoneFrame";
import { WORDS } from "./words";

export const START = "/trade/BTC";

export function LandingNav() {
  const { nav } = WORDS;
  return (
    <header className="lp-nav-wrap">
      <nav className="lp-nav" aria-label={nav.label}>
        <Link href="/" className="lp-brand" aria-label={nav.home}>
          <Seal size="sm" />
          <span className="lp-brand-name">{BRAND.name}</span>
        </Link>
        <div className="lp-nav-links">
          <Link href="/markets" className="lp-nav-link">{nav.markets}</Link>
          <Link href="/games" className="lp-nav-link">{nav.games}</Link>
          <a href="#how" className="lp-nav-link">{nav.how}</a>
          <a href={DOCS_URL} className="lp-nav-link">{nav.docs}</a>
        </div>
        <div className="lp-nav-end">
          <Link href="/download" className="lp-nav-app">{nav.app}</Link>
          <Link href={START} className="lp-btn lp-btn--accent lp-btn--sm">{nav.start}</Link>
          {/* Phones: every link one tap away, in a glass panel — `<details>`, so the menu ships no script. */}
          <details className="lp-menu">
            <summary className="lp-menu-button" aria-label={nav.menu}><Menu aria-hidden /></summary>
            <div className="lp-menu-panel">
              <Link href="/markets" className="lp-menu-link">{nav.markets}</Link>
              <Link href="/games" className="lp-menu-link">{nav.games}</Link>
              <a href="#how" className="lp-menu-link">{nav.how}</a>
              <Link href="/download" className="lp-menu-link">{nav.app}</Link>
              <a href={DOCS_URL} className="lp-menu-link">{nav.docs}</a>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}

export function LandingHero() {
  const { hero } = WORDS;
  return (
    <section className="lp-hero" aria-labelledby="lp-h1">
      <div className="lp-hero-ground" aria-hidden />
      <div className="lp-grain" aria-hidden />
      <LandingNav />
      <div className="lp-hero-grid">
        <div className="lp-hero-copy">
          <span className="lp-chip"><span className="lp-live-dot" aria-hidden />{hero.kicker}</span>
          <h1 id="lp-h1" className="lp-h1">
            <span className="lp-h1-a">{hero.title[0]}</span>
            <span className="lp-h1-b">{hero.title[1]} <em>{hero.accent}</em></span>
          </h1>
          <p className="lp-line">{hero.line}</p>
          <div className="lp-hero-ctas">
            <Link href={START} className="lp-btn lp-btn--accent lp-btn--lg" data-primary-action>
              {hero.start} <ArrowRight aria-hidden />
            </Link>
            <Link href="/download" className="lp-btn lp-btn--glass lp-btn--lg">
              <Smartphone aria-hidden /> {hero.app}
            </Link>
          </div>
        </div>

        <div className="lp-stage" aria-label={hero.stage}>
          <span className="lp-wordmark lp-neon" aria-hidden lang="ja" data-text={BRAND.kanji}>{BRAND.kanji}</span>
          <div className="lp-stage-side lp-stage-side--l" aria-hidden>
            <PhoneFrame><PhoneShot name="markets" alt="" eager /></PhoneFrame>
          </div>
          <div className="lp-stage-side lp-stage-side--r" aria-hidden>
            <PhoneFrame><PhoneShot name="games" alt="" eager /></PhoneFrame>
          </div>
          <div className="lp-stage-main">
            <HeroPhone />
          </div>
        </div>
      </div>
    </section>
  );
}
