"use client";
// More (D-226) — Owarine 90a91d71 `components/shell/app/MoreSheet.tsx`'s anatomy on Mitoshi's drawer (a bottom sheet
// under 768 px, the wide right drawer above): the search row, the places the phone dock has no room for as a 3-up grid,
// then every page that is not a place, grouped, as tiles (icon disc, name, one line). Opened from the rail, the dock and
// `?d=everything`. The external Docs link goes through `open-external` so the app's web view never navigates away; a
// link drops the URL param first so Back from the new page doesn't reopen the drawer.
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { SHELL } from "@/lib/copy";
import { dropDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { externalClick } from "@/lib/open-external";
import { DOCK_OMITTED, EVERYTHING_SECTIONS, isActiveNavItem, searchNav, type NavItem } from "./header/nav-items";
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
        <span className="more-tile-name">{item.name}{item.beta ? <sup>beta</sup> : null}</span>
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

export function EverythingDrawer({ open, onOpenChange, pathname }: EverythingDrawerProps) {
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [pathname, open]);
  const sections = useMemo(
    () => EVERYTHING_SECTIONS.map((s) => ({ ...s, items: searchNav(s.items, query) })).filter((s) => s.items.length > 0),
    [query],
  );

  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={SHELL.moreTitle} className="is-wide">
        <div className="more-body">
          <label className="more-search" role="search">
            <span className="sr-only">{SHELL.searchLabel}</span>
            <Search aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={SHELL.searchPlaceholder} autoComplete="off" enterKeyHint="go" />
          </label>
          {query === "" ? (
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
          ) : null}
          {sections.length === 0 ? <p className="more-empty" role="status">{SHELL.searchEmpty(query)}</p> : null}
          {sections.map((section) => (
            <section className="more-section" key={section.id} aria-labelledby={`more-${section.id}`}>
              <h2 id={`more-${section.id}`} className="more-section-title">{section.name}</h2>
              <div className="more-grid">
                {section.items.map((item) => (
                  <Tile key={item.id} item={item} active={isActiveNavItem(pathname, item)} />
                ))}
              </div>
            </section>
          ))}
          <div className="more-foot">
            <ThemeToggle />
          </div>
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
