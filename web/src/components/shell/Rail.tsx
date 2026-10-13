"use client";
// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/rail.client.tsx — the floating rail, Slush's
// anatomy as roy-chain measured it (items 48 high at a 60 pitch, 18 px labels, a pill under the active place, the
// place's key on hover), in Mitoshi's colours (D-189); Owarine's six places and More (D-226). Changed (D-198): lucide icons instead of Phosphor; the active
// pill moves by a CSS transform (no motion runtime in the shell's first load, components.md row 21) instead of
// roy-chain's `layoutId` spring from 21st.dev 21517 (unlumen/animated-sidebar); the mode switch is gone (Mitoshi has
// one network per deployment — the mode plate says which); places come from the nav registry; More opens the More
// drawer. The path is read inside Suspense (cacheComponents keeps the static shell). R4-8 (D-227), to Owarine 90a91d71
// `components/shell/app/AppRail.tsx`: the head is the vermilion seal disc and the mode plate (DEMO / TESTNET, its
// hanko) instead of a static pill; rows at 16 px/600 with 22 px icons; More is lit as "here" on any page that is not a
// place and says whether it is open; the foot ends in the theme toggle beside App · Docs · Legal (full rail only; App is /download, D-230).
import { useUnread } from "@/features/notifications/store";
import { History, LayoutGrid, LineChart, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type CSSProperties, type ReactNode } from "react";
import { BRAND, FOOTER, SHELL } from "@/lib/copy";
import { DOCS_URL } from "@/lib/docs-url";
import { openDrawer, useDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { ExternalLink } from "./ExternalLink";
import MitoshiMark from "./MitoshiMark";
import { ModePlate, ModeStamp } from "./ModePlate";
import ThemeToggle from "./ThemeToggle";
import { isActiveNavItem, RAIL_NAV } from "./header/nav-items";

export const EVERYTHING_DRAWER = "everything";

/** True while the user is typing or a dialog holds focus, so single-key shortcuts stay out of the way. */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const t = event.target;
  if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return true;
  return document.querySelector('[role="dialog"][aria-modal="true"], [role="dialog"][data-open]') !== null;
}

/** 1–6 jump between the places (Owarine's map; the keyboard map in the `?` dialog). Mounted once, by the rail. */
function usePlaceKeys(): void {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return;
      const item = RAIL_NAV[Number(event.key) - 1];
      if (!item || !/^[1-9]$/.test(event.key)) return;
      event.preventDefault();
      router.push(item.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

function RailNav({ pathname, moreOpen = false }: { pathname: string | null; moreOpen?: boolean }) {
  const active = RAIL_NAV.findIndex((item) => isActiveNavItem(pathname, item));
  // Owarine's here-state: a page that is no place lives under More, so More is lit while you are on it.
  const moreHere = active < 0 && pathname !== null && pathname !== "/";
  // S13: what arrived since the notification centre was last opened (it lives under Portfolio).
  const unread = useUnread();
  return (
    <nav aria-label={SHELL.railNav} className="rail-nav">
      <span aria-hidden className="rail-pill" data-on={active >= 0 ? "" : undefined} style={{ "--rail-i": Math.max(active, 0) } as CSSProperties} />
      {RAIL_NAV.map((item, i) => {
        const on = i === active;
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={on ? "page" : undefined}
            title={`${item.name} — ${item.description} (${i + 1})`}
            className="rail-item"
            onClick={tapFeedback}
          >
            <Icon aria-hidden className="rail-icon" />
            <span className="rail-label">{item.name}</span>
            {item.id === "portfolio" && unread > 0 ? <span className="rail-badge" aria-label={SHELL.unread(unread)}>{unread > 9 ? "9+" : unread}</span> : null}
            <kbd aria-hidden className="rail-key">{i + 1}</kbd>
          </Link>
        );
      }).flatMap((link, i) => (RAIL_NAV[i]!.id === "trade" && i === active ? [link, <TradeSubList key="trade-sub" />] : [link]))}
      <button
        type="button"
        className="rail-item"
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        data-here={moreHere ? "" : undefined}
        title={`${SHELL.everything} — ${SHELL.everythingHint}`}
        onClick={() => {
          tapFeedback();
          openDrawer(EVERYTHING_DRAWER);
        }}
      >
        <LayoutGrid aria-hidden className="rail-icon" />
        <span className="rail-label">{SHELL.everything}</span>
      </button>
    </nav>
  );
}

/** On the terminal, the Trade place opens its own drawers (Tradash's nav column: Markets · History · Settings). */
const TRADE_SUB = [
  { drawer: "trade-markets", label: SHELL.tradeSub.markets, icon: LineChart },
  { drawer: "trade-history", label: SHELL.tradeSub.history, icon: History },
  { drawer: "trade-settings", label: SHELL.tradeSub.settings, icon: SlidersHorizontal },
] as const;

function TradeSubList() {
  return (
    <div className="rail-sub" role="group" aria-label={SHELL.tradeSub.label}>
      {TRADE_SUB.map(({ drawer, label, icon: Icon }) => (
        <button key={drawer} type="button" className="rail-sub-item" title={label} onClick={() => (tapFeedback(), openDrawer(drawer))}>
          <Icon aria-hidden className="rail-sub-icon" />
          <span className="rail-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

function RailNavWithPath() {
  const { open } = useDrawerParam();
  return <RailNav pathname={usePathname()} moreOpen={open === EVERYTHING_DRAWER} />;
}

/**
 * The rail: the 見通し mark and the network, the places, and a foot the route group fills (money and account). Fixed
 * and inset so the canvas shows around it, as in Slush; hidden on phones, where the top line and the dock take over.
 */
export function Rail({ foot }: { foot?: ReactNode }) {
  usePlaceKeys();
  return (
    <aside className="app-rail" aria-label={SHELL.railLabel}>
      <div className="rail-brand">
        <Link href="/markets" aria-label={`${BRAND.name} home`} title={`${BRAND.name} home`} className="rail-mark">
          <span className="rail-disc"><MitoshiMark /></span>
          <span className="rail-word">{BRAND.name.toUpperCase()}</span>
        </Link>
        <ModePlate className="rail-plate" />
        <ModeStamp className="rail-stamp" />
      </div>
      <Suspense fallback={<RailNav pathname={null} />}>
        <RailNavWithPath />
      </Suspense>
      <div className="rail-foot">
        {foot}
        <div className="rail-tools">
          <ThemeToggle />
          <nav className="rail-legal" aria-label={SHELL.legalNav}>
            {/* Get the app (D-230), then the guides site, where Owarine 90a91d71 AppRail links its docs (D-227). */}
            <Link href="/download" title={FOOTER.links.app}>{SHELL.railApp}</Link>
            <span aria-hidden>·</span>
            <ExternalLink href={DOCS_URL}>{FOOTER.links.docs}</ExternalLink>
            <span aria-hidden>·</span>
            <Link href="/terms">{SHELL.legal}</Link>
          </nav>
        </div>
      </div>
    </aside>
  );
}
