"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/MobileBottomNav.tsx — four fast paths plus More. The
// More panel is the right-edge slide-over (owner rule; From 21st.dev 31360 via `ui/drawer.tsx`) with a search row at
// the top (ux-audit fix 14), 11 px labels and a focus ring distinct from the active state (`shell-fixes.css`), and
// the external Docs link routed through `open-external` so it never navigates the app's web view away.
import { MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SlideOver, SlideOverContent, SlideOverTrigger } from "@/components/ui/drawer";
import { SHELL } from "@/lib/copy";
import { externalClick } from "@/lib/open-external";
import { isActiveNavItem, MOBILE_DRAWER_SECTIONS, MOBILE_NAV, MOBILE_OVERFLOW, searchNav } from "./nav-items";

export function MobileBottomNav({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fastPathActive = MOBILE_NAV.some((item) => isActiveNavItem(pathname, item));
  const moreActive = !fastPathActive && MOBILE_OVERFLOW.some((item) => isActiveNavItem(pathname, item));

  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [pathname]);

  const sections = useMemo(
    () => MOBILE_DRAWER_SECTIONS.map((s) => ({ ...s, items: searchNav(s.items, query) })).filter((s) => s.items.length > 0),
    [query],
  );

  return (
    <SlideOver open={open} onOpenChange={setOpen}>
      <nav className="mobile-bottom-nav" aria-label={SHELL.mobileNav}>
        {MOBILE_NAV.map((item) => {
          const active = isActiveNavItem(pathname, item);
          const Icon = item.icon;
          return (
            <Link key={item.id} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <Icon aria-hidden="true" />
              <span>{item.name}</span>
            </Link>
          );
        })}
        <SlideOverTrigger render={<button type="button" className={moreActive || open ? "active" : ""} />} aria-label={SHELL.moreTitle}>
          <MoreHorizontal aria-hidden="true" />
          <span>{SHELL.moreLabel}</span>
        </SlideOverTrigger>
      </nav>

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
            <section className="mobile-nav-group" key={section.id} aria-labelledby={`mobile-nav-${section.id}`}>
              <div className="mobile-nav-group-title">
                <h2 id={`mobile-nav-${section.id}`}>{section.name}</h2>
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
                    <Link key={item.id} href={item.href} className={`mobile-nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>
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
