"use client";
// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/mobile-dock.client.tsx (21st.dev 15742
// starc007/dock via Baku, glass removed) — the phone's rail: a floating capsule in the rail colour, the four places and
// Everything, a pill under the active item. Changed (D-198): lucide icons; the pill moves by a CSS transform (no
// motion runtime in the first load) instead of a `layoutId`; Everything opens the right-edge drawer (owner rule, no
// bottom sheet). The path is read inside Suspense. R4-8 (D-227), Owarine 90a91d71 `PhoneDock` + kit `FloatingDock`:
// More is lit — the pill springs to it — while More is open or the page is no docked place (/games, /leaderboard,
// /earn… lit nothing), the docked place unlights while More is open, and More says whether it is open. Round 7 (the
// owner's TestFlight review, Senryo's dock): the seal is Trade, not a link to the marketing page, and glows on /trade.
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { SHELL } from "@/lib/copy";
import MitoshiMark from "./MitoshiMark";
import { openDrawer, useDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { DOCK_NAV, isActiveNavItem, NAV_ITEMS } from "./header/nav-items";

const EVERYTHING_DRAWER = "everything";

function Dock({ pathname, moreOpen = false }: { pathname: string | null; moreOpen?: boolean }) {
  const docked = DOCK_NAV.findIndex((item) => isActiveNavItem(pathname, item));
  const trading = isActiveNavItem(pathname, NAV_ITEMS.trade);
  const moreLit = moreOpen || (docked < 0 && !trading && pathname !== null && pathname !== "/");
  const active = moreLit ? -1 : docked;
  // The seal sits in the middle slot, so places after it shift one slot right; More is the last slot.
  const slot = moreLit ? DOCK_NAV.length + 1 : active >= SEAL_AT ? active + 1 : Math.max(active, 0);
  return (
    <nav aria-label={SHELL.mobileNav} className="app-dock">
      <ul className="dock-list">
        <li aria-hidden className="dock-pill" data-on={active >= 0 || moreLit ? "" : undefined} style={{ "--dock-i": slot } as CSSProperties} />
        {DOCK_NAV.flatMap((item, i) => {
          const Icon = item.icon;
          const on = i === active;
          const li = (
            <li key={item.id}>
              <Link href={item.href} aria-current={on ? "page" : undefined} className="dock-item" onClick={tapFeedback}>
                <Icon aria-hidden className="dock-icon" />
                <span className="dock-label">{item.name}</span>
              </Link>
            </li>
          );
          return i === SEAL_AT ? [<SealSlot key="seal" on={trading && !moreOpen} />, li] : [li];
        })}
        <li>
          <button
            type="button"
            className="dock-item"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreLit && !moreOpen ? "page" : undefined}
            data-lit={moreLit ? "" : undefined}
            aria-label={SHELL.moreTitle}
            onClick={() => {
              tapFeedback();
              openDrawer(EVERYTHING_DRAWER);
            }}
          >
            <LayoutGrid aria-hidden className="dock-icon" />
            <span className="dock-label">{SHELL.moreLabel}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** The centre seal (round 7, Senryo's dock): Trade — `/trade` opens the last symbol traded here (proxy). */
const SEAL_AT = 2;
function SealSlot({ on }: { on: boolean }) {
  return (
    <li>
      <Link href="/trade" aria-label={NAV_ITEMS.trade.name} title={NAV_ITEMS.trade.name} aria-current={on ? "page" : undefined} data-on={on ? "" : undefined} className="dock-item dock-seal" onClick={tapFeedback}>
        <span className="dock-seal-disc"><MitoshiMark /></span>
      </Link>
    </li>
  );
}

function DockWithPath() {
  const { open } = useDrawerParam();
  return <Dock pathname={usePathname()} moreOpen={open === EVERYTHING_DRAWER} />;
}

export function MobileDock() {
  return (
    <Suspense fallback={<Dock pathname={null} />}>
      <DockWithPath />
    </Suspense>
  );
}
