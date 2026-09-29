"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/header/MobileBottomNav.tsx — four fast paths plus More. The
// More panel is the right-edge slide-over (owner rule; From 21st.dev 31360 via `ui/drawer.tsx`) with a search row at
// the top (ux-audit fix 14), 11 px labels and a focus ring distinct from the active state (`shell-fixes.css`), and
// the external Docs link routed through `open-external` so it never navigates the app's web view away.
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { onIdle } from "@/lib/idle";
import { SHELL } from "@/lib/copy";
import { isActiveNavItem, MOBILE_NAV, MOBILE_OVERFLOW } from "./nav-items";
import type { MorePanelProps } from "./MorePanel";

// The panel (Base UI Drawer + every destination) is a lazy island preloaded on idle: it is not first-load JS (§3.1).
let panelModule: Promise<ComponentType<MorePanelProps>> | null = null;
const loadPanel = () => (panelModule ??= import("./MorePanel").then((m) => m.MorePanel));

export function MobileBottomNav({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<MorePanelProps> | null>(null);
  const fastPathActive = MOBILE_NAV.some((item) => isActiveNavItem(pathname, item));
  const moreActive = !fastPathActive && MOBILE_OVERFLOW.some((item) => isActiveNavItem(pathname, item));
  const load = useCallback(() => void loadPanel().then((C) => setPanel(() => C)), []);

  useEffect(() => onIdle(load), [load]);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
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
        <button
          type="button"
          className={moreActive || open ? "active" : ""}
          aria-label={SHELL.moreTitle}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            load();
            setOpen(true);
          }}
        >
          <MoreHorizontal aria-hidden="true" />
          <span>{SHELL.moreLabel}</span>
        </button>
      </nav>
      {Panel ? <Panel open={open} onOpenChange={setOpen} pathname={pathname} /> : null}
    </>
  );
}
