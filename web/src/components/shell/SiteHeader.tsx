// The public site's header (S22, D-189): the landing, docs-adjacent pages, proof and status carry no app shell and no
// wallet stack (D-050) — just the 見通し mark, the theme and the way into the app the route group passes
// ("Open the app"). The app's places live in its rail and dock. From a tablet up it links the guides beside them, as
// Owarine's landing nav does (ported from Owarine 90a91d71:web/src/features/landing/LandingHero.tsx `LandingNav`, D-227).
import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND, FOOTER } from "@/lib/copy";
import { DOCS_URL } from "@/lib/docs-url";
import { ExternalLink } from "./ExternalLink";
import MitoshiMark from "./MitoshiMark";
import ThemeToggle from "./ThemeToggle";

export function SiteHeader({ account }: { account?: ReactNode }) {
  return (
    <header className="header site-header">
      <div className="header-lead">
        <Link className="logo" href="/" aria-label={`${BRAND.name} home`}>
          <span className="logo-mark"><MitoshiMark /></span>
          <span>{BRAND.name.toUpperCase()}</span>
        </Link>
      </div>
      <div className="header-right">
        <Link className="nav-link" href="/demo">Demo</Link>
        <ExternalLink className="nav-link site-docs" href={DOCS_URL}>{FOOTER.links.docs}</ExternalLink>
        <ThemeToggle />
        {account}
      </div>
    </header>
  );
}
