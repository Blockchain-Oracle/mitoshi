"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/Header.tsx — the same header grammar (mark, grouped
// desktop nav, theme, money + account on the right) with the ux-audit fixes: a back chevron below the top level
// (fix 5), a search button that opens the command palette (⌘K; lazy island), and the account area passed in by the
// route group so pages that carry no wallet stack never load it (D-050). Add money and the welcome card now live
// with the wallet (they were imported eagerly here and pulled motion into every route, R1).
import { ChevronLeft, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BRAND, SHELL } from "@/lib/copy";
import MitoshiMark from "../MitoshiMark";
import ThemeToggle from "../ThemeToggle";
import { DesktopNavMenu } from "./DesktopNavMenu";
import { MobileBottomNav } from "./MobileBottomNav";
import { DESKTOP_NAV, isActiveNavItem, isTopLevel, type NavGroup } from "./nav-items";

const CommandPalette = dynamic(() => import("@/components/ui/command-palette"), { ssr: false });

const MOBILE_MAX_WIDTH = 720;

/** The parent of a nested route: `/games/duel/abc` → `/games/duel`; `/markets/[id]` → `/markets`. */
export function parentPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length <= 1 ? "/" : `/${parts.slice(0, -1).join("/")}`;
}

/** The header knows the path only at request time (cacheComponents): the static shell renders it with no active item. */
export default function Header({ account }: { account?: ReactNode }) {
  return (
    <Suspense fallback={<HeaderView pathname={null} account={account} />}>
      <HeaderWithPath account={account} />
    </Suspense>
  );
}

function HeaderWithPath({ account }: { account?: ReactNode }) {
  return <HeaderView pathname={usePathname()} account={account} />;
}

function HeaderView({ pathname, account }: { pathname: string | null; account?: ReactNode }) {
  const router = useRouter();
  const [openGroup, setOpenGroup] = useState<NavGroup["id"] | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);

  useEffect(() => setOpenGroup(null), [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteLoaded(true);
        setPaletteOpen((open) => !open);
      }
    };
    const closeAtMobileWidth = () => {
      if (window.innerWidth <= MOBILE_MAX_WIDTH) setOpenGroup(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", closeAtMobileWidth);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", closeAtMobileWidth);
    };
  }, []);

  const nested = !isTopLevel(pathname);

  return (
    <>
      <header className="header">
        <div className="header-lead">
          {nested && pathname ? (
            <button type="button" className="header-back" aria-label={SHELL.back} onClick={() => router.push(parentPath(pathname))}>
              <ChevronLeft aria-hidden />
            </button>
          ) : null}
          <Link className="logo" href="/" aria-label={`${BRAND.name} home`}>
            <span className="logo-mark"><MitoshiMark /></span>
            <span>{BRAND.name.toUpperCase()}</span>
          </Link>
        </div>

        <nav className="nav" aria-label={SHELL.primaryNav}>
          <div className="nav-links">
            {DESKTOP_NAV.map((entry) => {
              if (entry.kind === "group") {
                return (
                  <DesktopNavMenu
                    key={entry.group.id}
                    group={entry.group}
                    pathname={pathname}
                    open={openGroup === entry.group.id}
                    onOpenChange={(open) => setOpenGroup(open ? entry.group.id : null)}
                  />
                );
              }
              const active = isActiveNavItem(pathname, entry.item);
              return (
                <Link key={entry.item.id} href={entry.item.href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                  {entry.item.name}
                </Link>
              );
            })}
          </div>

          <div className="header-right">
            <button
              type="button"
              className="header-icon-button"
              aria-label={SHELL.commandHint}
              aria-keyshortcuts="Meta+K Control+K"
              onClick={() => {
                setPaletteLoaded(true);
                setPaletteOpen(true);
              }}
            >
              <Search aria-hidden />
            </button>
            <ThemeToggle />
            {account}
          </div>
        </nav>
      </header>

      <MobileBottomNav pathname={pathname} />
      {paletteLoaded ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}
    </>
  );
}
