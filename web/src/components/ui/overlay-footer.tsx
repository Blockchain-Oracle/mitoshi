"use client";

// The open overlay's pinned-footer slot, `SheetFooter` and `dropOnLeave` (R4-2, D-227), split from `drawer.tsx` so a body
// that only places its action bar doesn't pull Base UI's drawer into its route's first load. `drawer.tsx` re-exports them.
import { createContext, useContext, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { dropDrawerParam } from "@/lib/drawer-param";

/**
 * The open overlay's pinned footer, for `SheetFooter`: undefined outside a sheet or a modal, null inside one until its
 * footer has mounted (the first pass), then the footer's node.
 */
export const OverlayFooterSlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * A body's own action bar (the ticket's CTA dock, a sheet's Confirm): inside a sheet or a modal it renders in the pinned
 * footer, outside the scroll and above a phone's keyboard; anywhere else (the ticket on the rail) in place. Inside an
 * overlay it waits the one synchronous pass for the footer's node rather than mounting in the body and moving (which
 * ran its effects twice and dropped focus from a CTA the sheet had just focused).
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  const slot = useContext(OverlayFooterSlot);
  if (slot === undefined) return <>{children}</>;
  return slot ? createPortal(children, slot) : null;
}

/** Before a link inside the sheet (or a modal) navigates, drop `?d=` so Back from the new page doesn't reopen it (D-190). */
export function dropOnLeave(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self")) return;
  const to = new URL(link.href, window.location.href);
  if (to.origin === window.location.origin && to.pathname !== window.location.pathname) dropDrawerParam();
}
