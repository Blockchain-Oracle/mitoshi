"use client";
// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/top-line.tsx — the line above the stage: on
// phones it carries the mark and the network (the rail is hidden there); then search (⌘K or /), the `?` shortcuts and
// the theme. Changed for Mitoshi (S22, D-189): no round or data-health chips (Mitoshi has neither); the back chevron
// below the top level (ux-audit fix 5, from the old header); the account and money slot the route group fills; the
// command palette and the shortcuts modal are lazy islands. Static: nothing scrolls or rotates (WCAG 2.2.2).
import { ChevronLeft, CircleHelp, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BRAND, SHELL } from "@/lib/copy";
import { tapFeedback } from "@/lib/feedback";
import MitoshiMark from "./MitoshiMark";
import { HealthChip } from "./HealthChip";
import { ModeChip } from "./ModeChip";
import { shortcutBlocked } from "./Rail";
import ThemeToggle from "./ThemeToggle";
import { isTopLevel } from "./header/nav-items";

const CommandPalette = dynamic(() => import("@/components/ui/command-palette"), { ssr: false });
const ShortcutsModal = dynamic(() => import("./ShortcutsModal").then((m) => m.ShortcutsModal), { ssr: false });

/** The parent of a nested route: `/games/duel/abc` → `/games/duel`; `/markets/[id]` → `/markets`. */
export function parentPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length <= 1 ? "/" : `/${parts.slice(0, -1).join("/")}`;
}

function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (isTopLevel(pathname)) return null;
  return (
    <button type="button" className="topline-icon topline-back" aria-label={SHELL.back} onClick={() => router.push(parentPath(pathname))}>
      <ChevronLeft aria-hidden />
    </button>
  );
}

export function TopLine({ account }: { account?: ReactNode }) {
  const [palette, setPalette] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<boolean | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
        return;
      }
      if (shortcutBlocked(event)) return;
      if (event.key === "/") {
        event.preventDefault();
        setPalette(true);
      } else if (event.key === "?") {
        event.preventDefault();
        setKeys(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="app-topline">
      <div className="topline-lead">
        <Suspense fallback={null}>
          <BackButton />
        </Suspense>
        <Link href="/" aria-label={`${BRAND.name} home`} className="topline-mark">
          <MitoshiMark />
        </Link>
        <span className="topline-phone"><ModeChip /></span>
        <span className="topline-wide"><HealthChip className="topline-network" /></span>
      </div>
      <div className="topline-tools">
        <button
          type="button"
          className="topline-search topline-wide"
          aria-label={SHELL.commandHint}
          aria-keyshortcuts="Meta+K Control+K /"
          onClick={() => {
            tapFeedback();
            setPalette(true);
          }}
        >
          <Search aria-hidden />
          <span className="topline-search-label">{SHELL.searchPlaceholder}</span>
          <kbd aria-hidden className="topline-kbd">⌘K</kbd>
        </button>
        <button
          type="button"
          className="topline-icon"
          aria-label={SHELL.shortcutsOpen}
          aria-keyshortcuts="?"
          onClick={() => {
            tapFeedback();
            setKeys(true);
          }}
        >
          <CircleHelp aria-hidden />
        </button>
        <span className="topline-wide"><ThemeToggle /></span>
        {account}
      </div>
      {palette !== null ? <CommandPalette open={palette} onOpenChange={setPalette} /> : null}
      {keys !== null ? <ShortcutsModal open={keys} onOpenChange={setKeys} /> : null}
    </header>
  );
}
