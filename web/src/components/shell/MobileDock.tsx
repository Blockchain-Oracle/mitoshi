"use client";
// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/mobile-dock.client.tsx (21st.dev 15742
// starc007/dock via Baku, glass removed) — the phone's rail: a floating capsule in the rail colour, the four places and
// Everything, a pill under the active item. Changed (D-198): lucide icons; the pill moves by a CSS transform (no
// motion runtime in the first load) instead of a `layoutId`; Everything opens the right-edge drawer (owner rule, no
// bottom sheet). The path is read inside Suspense.
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { SHELL } from "@/lib/copy";
import { openDrawer } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { DOCK_NAV, isActiveNavItem } from "./header/nav-items";

const EVERYTHING_DRAWER = "everything";

function Dock({ pathname }: { pathname: string | null }) {
  const active = DOCK_NAV.findIndex((item) => isActiveNavItem(pathname, item));
  return (
    <nav aria-label={SHELL.mobileNav} className="app-dock">
      <ul className="dock-list">
        <li aria-hidden className="dock-pill" data-on={active >= 0 ? "" : undefined} style={{ "--dock-i": Math.max(active, 0) } as CSSProperties} />
        {DOCK_NAV.map((item, i) => {
          const Icon = item.icon;
          const on = i === active;
          return (
            <li key={item.id}>
              <Link href={item.href} aria-current={on ? "page" : undefined} className="dock-item" onClick={tapFeedback}>
                <Icon aria-hidden className="dock-icon" />
                <span className="dock-label">{item.name}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="dock-item"
            aria-haspopup="dialog"
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

function DockWithPath() {
  return <Dock pathname={usePathname()} />;
}

export function MobileDock() {
  return (
    <Suspense fallback={<Dock pathname={null} />}>
      <DockWithPath />
    </Suspense>
  );
}
