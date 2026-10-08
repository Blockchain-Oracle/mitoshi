"use client";
/**
 * Drawers that live in the URL (D-190; `revamp-parity.md` RV-13): `?d=<name>` opens one, so Back closes it, a reload
 * keeps it, and a link can open it. Writes go through `history.pushState` (Next keeps `useSearchParams` in step with
 * it), so opening a drawer never re-renders the route on the server. Read inside a Suspense boundary.
 */
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const DRAWER_PARAM = "d";

function urlWith(name: string | null): string {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set(DRAWER_PARAM, name);
  else url.searchParams.delete(DRAWER_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Open a drawer by name from anywhere (a button outside the Suspense boundary that reads the param). The entry is
 * marked as ours so `closeDrawer` can step back. Only our marker is passed: Next.js treats a state that carries its own
 * internal flag as an internal push and would not update `useSearchParams`; given a plain state it syncs the router
 * and adds its own fields.
 */
export function openDrawer(name: string): void {
  window.history.pushState({ __drawer: name }, "", urlWith(name));
}

/** Close the open drawer: step back when we pushed it, else drop the param in place (it came with the page). */
export function closeDrawer(): void {
  const opened = new URLSearchParams(window.location.search).get(DRAWER_PARAM);
  if (!opened) return;
  if ((window.history.state as { __drawer?: string } | null)?.__drawer === opened) window.history.back();
  else window.history.replaceState(null, "", urlWith(null));
}

/** The drawer named in the URL, with its openers. */
export function useDrawerParam(): { open: string | null; show: (name: string) => void; close: () => void } {
  const params = useSearchParams();
  const show = useCallback((name: string) => openDrawer(name), []);
  return { open: params.get(DRAWER_PARAM), show, close: closeDrawer };
}

/** Before a link inside a drawer navigates: drop the param in place, so Back from the new page doesn't reopen it. */
export function dropDrawerParam(): void {
  if (new URLSearchParams(window.location.search).has(DRAWER_PARAM)) window.history.replaceState(null, "", urlWith(null));
}
