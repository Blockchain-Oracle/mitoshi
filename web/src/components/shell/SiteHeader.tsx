// The public site's header (S22, D-189): the landing, docs-adjacent pages, proof and status carry no app shell and no
// wallet stack (D-050) — just the 見通し mark, the network, the theme and the way into the app the route group passes
// ("Open the app"). The app's places live in its rail and dock.
import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/copy";
import MitoshiMark from "./MitoshiMark";
import { NetworkPill } from "./NetworkPill";
import ThemeToggle from "./ThemeToggle";

export function SiteHeader({ account }: { account?: ReactNode }) {
  return (
    <header className="header site-header">
      <div className="header-lead">
        <Link className="logo" href="/" aria-label={`${BRAND.name} home`}>
          <span className="logo-mark"><MitoshiMark /></span>
          <span>{BRAND.name.toUpperCase()}</span>
        </Link>
        <NetworkPill />
      </div>
      <div className="header-right">
        <ThemeToggle />
        {account}
      </div>
    </header>
  );
}
