"use client";
// Owarine 90a91d71's `useIsDesktop` (R4-3, D-227): the terminal's one breakpoint (64rem, the ticket rail's), read with
// useSyncExternalStore so a piece mounted once per breakpoint (the chart controls: the phone footer's first row, or the
// stage's corner) never runs twice — the music and the menu state never double.
import { useSyncExternalStore } from "react";

const DESKTOP_QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => true);
}
