"use client";
// More (D-226) — Owarine 90a91d71 `components/shell/app/MoreSheet.tsx`'s anatomy on Mitoshi's drawer (a bottom sheet
// under 768 px, the wide right drawer above, D-190): the search pill, the places the phone dock has no room for as a
// 3-up inverted grid, then every page that is not a place, grouped, as tiles (icon disc, name, one line), and the small
// print. Opened from the rail, the dock and `?d=everything`. R4-8 (D-227): the search pill opens the whole ⌘K palette
// (places, live markets, every page) — Owarine's `OPEN_SEARCH_EVENT` — so a phone reaches it; it used to filter More's
// own tiles only. A page not connected yet says "Soon" (critic gap 18). The external Docs link goes through
// `open-external`; a link drops the URL param first so Back from the new page doesn't reopen the drawer. D-230: "Get the
// app" leads the list (the platforms' marks, to /download) until the app is installed — and stands in for Learn's own
// tile meanwhile, so /download is offered once.
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { AndroidGlyph, AppleGlyph } from "@/components/icons/StoreGlyphs";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { useInstallState } from "@/features/install/useInstallPrompt";
import { isPendingHref } from "@/lib/capabilities";
import { FOOTER, SHELL } from "@/lib/copy";
import { closeDrawer, dropDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { externalClick } from "@/lib/open-external";
import { openSearch } from "@/lib/search-event";
import { DOCK_OMITTED, EVERYTHING_SECTIONS, isActiveNavItem, NAV_ITEMS, type NavItem } from "./header/nav-items";
import ThemeToggle from "./ThemeToggle";

export interface EverythingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string | null;
}

function Tile({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const body = (
    <>
      <span className="more-tile-disc"><Icon aria-hidden /></span>
      <span className="more-tile-copy">
        <span className="more-tile-name">
          {item.name}
          {item.beta ? <sup>beta</sup> : null}
          {isPendingHref(item.href) ? <span className="nav-soon">{SHELL.soon}</span> : null}
        </span>
        <span className="more-tile-line">{item.description}</span>
      </span>
    </>
  );
  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className="more-tile" onClick={externalClick}>{body}</a>
  ) : (
    <Link href={item.href} className="more-tile" aria-current={active ? "page" : undefined} onClick={() => { tapFeedback(); dropDrawerParam(); }}>
      {body}
    </Link>
  );
}

/** Get the app (D-230): the iPhone and Android marks, the name and its line, to /download. */
function GetTheApp({ active }: { active: boolean }) {
  const item = NAV_ITEMS.download;
  return (
    <Link href={item.href} className="more-app" aria-current={active ? "page" : undefined} onClick={() => { tapFeedback(); dropDrawerParam(); }}>
      <span className="more-app-marks" aria-hidden>
        <AppleGlyph />
        <AndroidGlyph />
      </span>
      <span className="more-tile-copy">
        <span className="more-tile-name">{item.name}</span>
        <span className="more-tile-line">{item.description}</span>
      </span>
      <ArrowRight aria-hidden className="more-app-arrow" />
    </Link>
  );
}

export function EverythingDrawer({ open, onOpenChange, pathname }: EverythingDrawerProps) {
  const { installed } = useInstallState();
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={SHELL.moreTitle} size="lg" fields>
        <div className="more-body">
          <button
            type="button"
            className="more-search"
            aria-haspopup="dialog"
            onClick={() => {
              tapFeedback();
              closeDrawer();
              openSearch();
            }}
          >
            <Search aria-hidden strokeWidth={2.5} />
            <span>{SHELL.searchPlaceholder}</span>
          </button>
          <nav className="more-places" aria-label={SHELL.railNav}>
            {DOCK_OMITTED.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.id} href={item.href} className="more-place" aria-current={isActiveNavItem(pathname, item) ? "page" : undefined} onClick={() => { tapFeedback(); dropDrawerParam(); }}>
                  <Icon aria-hidden />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
          {installed ? null : <GetTheApp active={isActiveNavItem(pathname, NAV_ITEMS.download)} />}
          {EVERYTHING_SECTIONS.map((section) => (
            <section className="more-section" key={section.id} aria-labelledby={`more-${section.id}`}>
              <h2 id={`more-${section.id}`} className="more-section-title">{section.name}</h2>
              <div className="more-grid">
                {section.items.filter((item) => installed || item.id !== NAV_ITEMS.download.id).map((item) => (
                  <Tile key={item.id} item={item} active={isActiveNavItem(pathname, item)} />
                ))}
              </div>
            </section>
          ))}
          <footer className="more-credit">
            <p>{FOOTER.disclosure}</p>
            <span className="more-foot"><ThemeToggle /></span>
          </footer>
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
