"use client";
// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/top-line.tsx — the line above the stage: on
// phones it carries the mark and the network (the rail is hidden there); then search (⌘K or /), the `?` shortcuts and
// the theme. Changed for Mitoshi (S22, D-189): no round or data-health chips (Mitoshi has neither); the back chevron
// below the top level (ux-audit fix 5, from the old header); the account and money slot the route group fills; the
// command palette and the shortcuts modal are lazy islands. Static: nothing scrolls or rotates (WCAG 2.2.2). R4-0
// (D-227): the chevron steps back through the app's own history, else to the page's registered parent (`PARENTS`) —
// dropping a segment opened a 404 from /tickers/*, /u/*, /proof/* and /settings/*. The palette's chunk loads on idle,
// so the first ⌘K opens at once (as EverythingHost preloads its drawer). R4-8 (D-227), to Owarine 90a91d71
// `components/shell/app/TopBar.tsx`: no `?` button (the key still opens the list) and no theme toggle (the rail's foot
// and More's foot carry it); the search trigger is labelled from 768 px; the phone's seal is the vermilion disc.
import { ChevronLeft, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BRAND, SHELL } from "@/lib/copy";
import { tapFeedback } from "@/lib/feedback";
import { onIdle } from "@/lib/idle";
import { OPEN_SEARCH_EVENT } from "@/lib/search-event";
import MitoshiMark from "./MitoshiMark";
import { HealthChip } from "./HealthChip";
import { ModeChip } from "./ModeChip";
import { shortcutBlocked } from "./Rail";
import { isTopLevel, parentOf } from "./header/nav-items";

const loadPalette = () => import("@/components/ui/command-palette");
const CommandPalette = dynamic(loadPalette, { ssr: false });
const ShortcutsModal = dynamic(() => import("./ShortcutsModal").then((m) => m.ShortcutsModal), { ssr: false });

/** Whether this tab has moved between the app's pages since it loaded: then Back has an in-app page to return to. */
let lastPath: string | null = null;
let movedInApp = false;

/** The entry behind this one is the app's own: the Navigation API knows (it lists same-origin entries only, so it stays
 *  right after the browser's own Back); without it, whether this tab has moved in the app. */
function canGoBackInApp(): boolean {
  const nav = (window as { navigation?: { canGoBack?: boolean } }).navigation;
  return typeof nav?.canGoBack === "boolean" ? nav.canGoBack : movedInApp;
}

function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) movedInApp = true;
    lastPath = pathname;
  }, [pathname]);
  if (isTopLevel(pathname)) return null;
  return (
    <button type="button" className="topline-icon topline-back" aria-label={SHELL.back} title={SHELL.back} onClick={() => (canGoBackInApp() ? router.back() : router.push(parentOf(pathname)))}>
      <ChevronLeft aria-hidden />
    </button>
  );
}

/** ⌘ K on Apple, Ctrl K elsewhere, decided on the client (the server renders ⌘ K). */
function SearchKeys() {
  const [apple, setApple] = useState(true);
  useEffect(() => setApple(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  return (
    <span aria-hidden className="topline-keys" suppressHydrationWarning>
      {(apple ? SHELL.searchKey.apple : SHELL.searchKey.other).map((k) => (
        <kbd key={k} className="topline-kbd">{k}</kbd>
      ))}
    </span>
  );
}

export function TopLine({ account }: { account?: ReactNode }) {
  const [palette, setPalette] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<boolean | null>(null);
  useEffect(() => onIdle(() => void loadPalette()), []);

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
    // Any page can open the palette (`openSearch()`: the 404's Search pill).
    const onSearch = () => setPalette(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onSearch);
    };
  }, []);

  return (
    <header className="app-topline">
      <div className="topline-lead">
        <Suspense fallback={null}>
          <BackButton />
        </Suspense>
        <Link href="/markets" aria-label={`${BRAND.name} home`} title={`${BRAND.name} home`} className="topline-mark">
          <MitoshiMark />
        </Link>
        <span className="topline-phone"><ModeChip /></span>
        <span className="topline-wide"><HealthChip className="topline-network" /></span>
      </div>
      <div className="topline-tools">
        {/* The wrapper hides it on phones; on the button itself `display: contents` stripped its box (S05). */}
        <span className="topline-wide">
          <button
            type="button"
            className="topline-search"
            aria-label={SHELL.searchPlaceholder}
            aria-keyshortcuts="Meta+K Control+K /"
            onClick={() => {
              tapFeedback();
              setPalette(true);
            }}
          >
            <Search aria-hidden strokeWidth={2.5} />
            <span className="topline-search-label">{SHELL.searchPlaceholder}</span>
            <SearchKeys />
          </button>
        </span>
        {account}
      </div>
      {palette !== null ? <CommandPalette open={palette} onOpenChange={setPalette} /> : null}
      {keys !== null ? <ShortcutsModal open={keys} onOpenChange={setKeys} /> : null}
    </header>
  );
}
