"use client";

import { useSyncExternalStore } from "react";
import { gameEntry, gameIdFromPath } from "./catalog";

/**
 * Pips remembers the last game a player opened (`lib/storage.ts` `lastGame`) and the hub offers it first.
 * The rail writes it as a route is visited; the hub reads it once. Absent where storage is refused.
 *
 * Read through `useLastGame`, never during a server render: the server has no storage and painted no plate,
 * so a client that read it while hydrating disagreed with the markup it was handed (measured 2026-09-04 as a
 * hydration error on `/games`). The server snapshot is null, and the plate appears after hydration.
 */
const KEY = "owarine.games.last";
const NONE = null;
const noop = () => () => undefined;

export function rememberGame(pathname: string | null): void {
  const id = gameIdFromPath(pathname);
  if (!id) return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // storage refused — nothing to remember
  }
}

function lastGamePlayed(): { href: string; name: string } | null {
  try {
    const id = gameIdFromPath(`/games/${window.localStorage.getItem(KEY) ?? ""}`);
    if (!id) return null;
    const entry = gameEntry(id);
    return entry.readiness.kind === "built" ? { href: entry.nav.href, name: entry.nav.name } : null;
  } catch {
    return null;
  }
}

/** Storage is read once per mount; the value is a string, so the snapshot is stable across renders. */
let snapshot: { key: string | null; value: { href: string; name: string } | null } = { key: null, value: null };

function read(): { href: string; name: string } | null {
  let key: string | null = null;
  try {
    key = window.localStorage.getItem(KEY);
  } catch {
    key = null;
  }
  if (snapshot.key !== key) snapshot = { key, value: lastGamePlayed() };
  return snapshot.value;
}

export function useLastGame(): { href: string; name: string } | null {
  return useSyncExternalStore(noop, read, () => NONE);
}
