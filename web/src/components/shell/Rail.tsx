"use client";
// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/rail.client.tsx — the floating rail, Slush's
// anatomy as roy-chain measured it (items 48 high at a 60 pitch, 18 px labels, a pill under the active place, the
// place's key on hover), in Mitoshi's colours (D-189). Changed (D-198): lucide icons instead of Phosphor; the active
// pill moves by a CSS transform (no motion runtime in the shell's first load, components.md row 21) instead of
// roy-chain's `layoutId` spring from 21st.dev 21517 (unlumen/animated-sidebar); the mode switch is gone (Mitoshi has
// one network per deployment — the Testnet pill says which); places come from the nav registry and the fifth key opens
// the Everything drawer. The path is read inside Suspense (cacheComponents keeps the static shell).
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type CSSProperties, type ReactNode } from "react";
import { BRAND, SHELL } from "@/lib/copy";
import { openDrawer } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import MitoshiMark from "./MitoshiMark";
import { NetworkPill } from "./NetworkPill";
import { isActiveNavItem, RAIL_NAV } from "./header/nav-items";

export const EVERYTHING_DRAWER = "everything";
const EVERYTHING_KEY = String(RAIL_NAV.length + 1);

/** True while the user is typing or a dialog holds focus, so single-key shortcuts stay out of the way. */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const t = event.target;
  if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return true;
  return document.querySelector('[role="dialog"][aria-modal="true"], [role="dialog"][data-open]') !== null;
}

/** 1–5 jump between the places, 6 opens Everything (the keyboard map in the `?` dialog). Mounted once, by the rail. */
function usePlaceKeys(): void {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return;
      if (event.key === EVERYTHING_KEY) {
        event.preventDefault();
        openDrawer(EVERYTHING_DRAWER);
        return;
      }
      const item = RAIL_NAV[Number(event.key) - 1];
      if (!item || !/^[1-9]$/.test(event.key)) return;
      event.preventDefault();
      router.push(item.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

function RailNav({ pathname }: { pathname: string | null }) {
  const active = RAIL_NAV.findIndex((item) => isActiveNavItem(pathname, item));
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
            <kbd aria-hidden className="rail-key">{i + 1}</kbd>
          </Link>
        );
      })}
      <button
        type="button"
        className="rail-item"
        aria-haspopup="dialog"
        title={`${SHELL.everything} — ${SHELL.everythingHint} (${EVERYTHING_KEY})`}
        onClick={() => {
          tapFeedback();
          openDrawer(EVERYTHING_DRAWER);
        }}
      >
        <LayoutGrid aria-hidden className="rail-icon" />
        <span className="rail-label">{SHELL.everything}</span>
        <kbd aria-hidden className="rail-key">{EVERYTHING_KEY}</kbd>
      </button>
    </nav>
  );
}

function RailNavWithPath() {
  return <RailNav pathname={usePathname()} />;
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
        <Link href="/" aria-label={`${BRAND.name} home`} className="rail-mark">
          <span className="rail-disc"><MitoshiMark /></span>
          <span className="rail-word">{BRAND.name.toUpperCase()}</span>
        </Link>
        <NetworkPill className="rail-network" />
      </div>
      <Suspense fallback={<RailNav pathname={null} />}>
        <RailNavWithPath />
      </Suspense>
      {foot ? <div className="rail-foot">{foot}</div> : null}
    </aside>
  );
}
