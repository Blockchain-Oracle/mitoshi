// Ported from Owarine 90a91d71:web/src/features/landing/LandingHero.tsx (R4-13a, D-227) — the first screen: the sky with
// its objects at the edges, a three-line display headline, the asset discs, one line, the accent "Start trading" and a
// paper pill, and the phone running the real terminal beside it (under the pills on phones) with two stickers. In
// Mitoshi's dusk and vermilion (`styles/landing.css`, kit.css `.kit-sky`). A server component; the phone and the theme
// toggle are the only client islands. Owarine's HeroEngineProvider is not ported: the phone IS the live terminal (an
// iframe), so the site group carries no markets runtime (the ≤ 35 KB own-JS budget).
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Seal } from "@/components/kit/Seal";
import { SkyCollage, type CollageObject } from "@/components/kit/SkyCollage";
import { Sticker } from "@/components/kit/Sticker";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BRAND } from "@/lib/copy";
import { DOCS_URL } from "@/lib/docs-url";
import { LandingPhone } from "./LandingPhone";
import { WORDS } from "./words";

export const START = "/trade/BTC";

/** The objects in the hero's sky, kept to the edges so the headline and the phone stay clear. */
const SKY: readonly CollageObject[] = [
  { name: "oldKey", x: 5, y: 88, size: 120, rotate: -24, float: 0 },
  { name: "coin", x: 44, y: 10, size: 60, rotate: 12, float: 1 },
  { name: "locked", x: 95, y: 14, size: 96, rotate: 10, float: 2 },
  { name: "moneyWithWings", x: 48, y: 92, size: 88, rotate: -8, float: 3 },
  { name: "bell", x: 96, y: 72, size: 76, rotate: 14, float: 4 },
  { name: "hourglassNotDone", x: 3, y: 22, size: 56, rotate: -14, float: 5 },
];

export function LandingNav() {
  const { nav } = WORDS;
  return (
    <nav className="lp-nav">
      <Link href="/" className="lp-brand" aria-label={nav.home}>
        <Seal size="sm" />
        <span className="lp-brand-name">{BRAND.name}</span>
      </Link>
      <div className="lp-nav-links">
        <Link href="/markets" className="lp-nav-link max-sm:hidden">{nav.markets}</Link>
        <Link href="/how-it-works" className="lp-nav-link max-md:hidden">{nav.how}</Link>
        <a href={DOCS_URL} className="lp-nav-link max-md:hidden">{nav.docs}</a>
        <ThemeToggle />
        <Link href={START} className="kit-pill kit-pill--ink kit-pill--sm">{nav.start}</Link>
      </div>
    </nav>
  );
}

export function LandingHero() {
  const { hero } = WORDS;
  return (
    <SkyCollage objects={SKY} eager className="lp-hero">
      <LandingNav />
      <div className="lp-hero-grid">
        <div className="lp-hero-copy">
          <span className="lp-kicker"><span className="lp-live-dot" aria-hidden />{hero.kicker}</span>
          <h1 className="lp-h1">
            {hero.title.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </h1>
          <div className="flex flex-col gap-3">
            <ul className="lp-discs" aria-label={hero.assetsLabel}>
              {hero.assets.map((a) => (
                <li key={a}>
                  <AssetDisc asset={a} className="lp-disc" />
                </li>
              ))}
            </ul>
            <p className="lp-line">{hero.line}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={START} className="kit-pill kit-pill--accent kit-pill--lg" data-primary-action>
              {hero.start} <ArrowRight aria-hidden />
            </Link>
            <Link href={START} className="kit-pill kit-pill--ghost kit-pill--lg">{hero.paper}</Link>
          </div>
        </div>
        <div className="lp-phone-col">
          <LandingPhone src={START} title={hero.frameTitle} />
          <Sticker tone="profit" tilt={-10} className="lp-sticker lp-sticker--a">{hero.stickers.passkey}</Sticker>
          <Sticker tone="accent" tilt={7} className="lp-sticker lp-sticker--b">{hero.stickers.oracle}</Sticker>
        </div>
      </div>
    </SkyCollage>
  );
}
