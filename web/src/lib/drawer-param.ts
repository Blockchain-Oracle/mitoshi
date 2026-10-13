"use client";
/**
 * Drawers that live in the URL (D-190; `revamp-parity.md` RV-13): `?d=<name>` opens one, so Back closes it, a reload
 * keeps it, and a link can open it. Writes go through `history.pushState` (Next keeps `useSearchParams` in step with
 * it), so opening a drawer never re-renders the route on the server. `useDrawerParam` reads through Next (inside a
 * Suspense boundary); `useOpenDrawerName` and `useUrlOverlay` read the address bar directly, so any sheet can carry its
 * state in the URL without a boundary (R4-2, D-227: the ticket, the pockets, the copy drawer, the room, Sensei).
 */
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export const DRAWER_PARAM = "d";
const CHANGED = "cwf:drawer";

function urlWith(name: string | null): string {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set(DRAWER_PARAM, name);
  else url.searchParams.delete(DRAWER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

const current = (): string | null => new URLSearchParams(window.location.search).get(DRAWER_PARAM);
const announce = () => window.dispatchEvent(new Event(CHANGED));

// A `history.back()` is asynchronous: until its popstate lands the param is still in the address bar, and a second
// close (the sheet's own and its host's) would step back twice — out of the page.
let backPending = false;
if (typeof window !== "undefined") window.addEventListener("popstate", () => (backPending = false));

/**
 * Open a drawer by name from anywhere (a button outside the Suspense boundary that reads the param). The entry is
 * marked as ours so `closeDrawer` can step back. Only our marker is passed: Next.js treats a state that carries its own
 * internal flag as an internal push and would not update `useSearchParams`; given a plain state it syncs the router
 * and adds its own fields.
 */
export function openDrawer(name: string): void {
  if (current() === name) return;
  window.history.pushState({ __drawer: name }, "", urlWith(name));
  announce();
}

/** Close the open drawer: step back when we pushed it, else drop the param in place (it came with the page). */
export function closeDrawer(): void {
  const opened = current();
  if (!opened || backPending) return;
  if ((window.history.state as { __drawer?: string } | null)?.__drawer === opened) {
    backPending = true;
    window.history.back();
  } else {
    window.history.replaceState(null, "", urlWith(null));
    announce();
  }
}

/** The drawer named in the URL, with its openers. */
export function useDrawerParam(): { open: string | null; show: (name: string) => void; close: () => void } {
  const params = useSearchParams();
  const show = useCallback((name: string) => openDrawer(name), []);
  return { open: params.get(DRAWER_PARAM), show, close: closeDrawer };
}

/** Before a link inside a drawer navigates: drop the param in place, so Back from the new page doesn't reopen it. */
export function dropDrawerParam(): void {
  if (!new URLSearchParams(window.location.search).has(DRAWER_PARAM)) return;
  window.history.replaceState(null, "", urlWith(null));
  announce();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The drawer named in the address bar, read without Next's router (no Suspense boundary needed). Null on the server. */
export function useOpenDrawerName(): string | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/**
 * Tie an overlay's open state to `?d=<name>` (D-190): opening pushes the param, closing steps back, Back closes it,
 * Forward and a reload or a link reopen it. Works for a controlled overlay (`open` given: the URL follows it and
 * `onOpenChange` hears Back) and an uncontrolled one (`open` undefined: the URL is the state). Returns the open state
 * to render and the change handler to give the overlay. With no `name` it passes both through untouched.
 */
export function useUrlOverlay(name: string | undefined, open: boolean | undefined, onOpenChange?: (open: boolean) => void): { open: boolean | undefined; onOpenChange: ((open: boolean) => void) | undefined } {
  const inUrl = useOpenDrawerName() === name && name !== undefined;
  const controlled = open !== undefined;
  const prev = useRef<{ open: boolean | undefined; inUrl: boolean } | null>(null);

  useEffect(() => {
    if (!name || !controlled) return;
    const before = prev.current;
    prev.current = { open, inUrl };
    if (before === null) {
      if (inUrl && !open) onOpenChange?.(true);
      else if (open && !inUrl) openDrawer(name);
      return;
    }
    if (open !== before.open) {
      if (open && !inUrl) openDrawer(name);
      else if (!open && inUrl) closeDrawer();
    } else if (inUrl !== before.inUrl) {
      if (open && !inUrl) onOpenChange?.(false);
      else if (!open && inUrl) onOpenChange?.(true);
    }
  }, [name, controlled, open, inUrl, onOpenChange]);

  if (!name) return { open, onOpenChange };
  // The overlay's own close (swipe, ✕, Escape) leaves the URL at once: a host that unmounts its sheet on close never
  // runs the effect above, and a second close is a no-op (`backPending`).
  if (controlled) {
    return {
      open,
      onOpenChange: (next) => {
        if (!next && current() === name) closeDrawer();
        onOpenChange?.(next);
      },
    };
  }
  return {
    open: inUrl,
    onOpenChange: (next) => {
      if (next) openDrawer(name);
      else closeDrawer();
      onOpenChange?.(next);
    },
  };
}
