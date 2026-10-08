"use client";
// The Everything drawer (S22, D-189/D-190): every destination that isn't a rail place, one home each, with the search
// row at the top (ux-audit fix 14) — the former phone More panel (Masayume 68f7a09 MobileBottomNav's sheet, From
// 21st.dev 31360 via `ui/drawer.tsx`), now the floating right drawer at every width and opened from the rail, the dock,
// key 5 and the `?d=everything` URL. The external Docs link goes through `open-external` so the app's web view never
// navigates away; a link drops the URL param first so Back from the new page doesn't reopen the drawer.
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { SHELL } from "@/lib/copy";
import { dropDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { externalClick } from "@/lib/open-external";
import { EVERYTHING_SECTIONS, isActiveNavItem, searchNav } from "./header/nav-items";

export interface EverythingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string | null;
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
      <SlideOverContent title={SHELL.moreTitle} description={SHELL.moreDescription}>
        <div className="more-search" role="search">
          <label className="relative block">
            <span className="sr-only">{SHELL.searchLabel}</span>
            <Search aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={SHELL.searchPlaceholder} autoComplete="off" enterKeyHint="go" />
          </label>
        </div>
        <nav className="mobile-nav-groups" aria-label={SHELL.allDestinations}>
          {sections.length === 0 ? <p className="more-empty" role="status">{SHELL.searchEmpty(query)}</p> : null}
          {sections.map((section) => (
            <section className="mobile-nav-group" key={section.id} aria-labelledby={`everything-${section.id}`}>
              <div className="mobile-nav-group-title">
                <h2 id={`everything-${section.id}`}>{section.name}</h2>
                <span>{section.description}</span>
              </div>
              <div className="mobile-nav-links">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActiveNavItem(pathname, item);
                  const body = (
                    <>
                      <span className="mobile-nav-icon"><Icon aria-hidden="true" /></span>
                      <span className="mobile-nav-copy">
                        <strong>{item.name}{item.beta && <sup>beta</sup>}</strong>
                        <small>{item.description}</small>
                      </span>
                    </>
                  );
                  return item.external ? (
                    <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer" className="mobile-nav-link" onClick={externalClick}>{body}</a>
                  ) : (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`mobile-nav-link ${active ? "active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        tapFeedback();
                        dropDrawerParam();
                      }}
                    >
                      {body}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </SlideOverContent>
    </SlideOver>
  );
}
