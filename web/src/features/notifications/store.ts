"use client";
/**
 * The notification centre's store (S13 step 6; Agari 03b30ab's `LifecycleWatcher` + `lifecycle-cursor` in purpose): one
 * poll of `/api/notifications` per tab — every 15 s while a wallet is connected and the tab is visible — and a
 * last-seen cursor per wallet in local storage, so the rail's badge counts what arrived since the centre was last opened.
 */
import { useSyncExternalStore } from "react";

export interface Notice {
  id: string;
  kind: "filled" | "won" | "lost" | "void" | "follower" | "take";
  atSec: number;
  title: string;
  href: string | null;
  /** The follower, the take's author: whose marble the row wears (absent on the wallet's own calls). */
  actor?: string;
}

const POLL_MS = 15_000;
/** `atMs`: when the last read answered (R6 money: the page's "Updated 12 s ago"). */
type Snap = { wallet: string | null; items: Notice[]; read: boolean; seenSec: number; error: boolean; atMs: number | null };
let snap: Snap = { wallet: null, items: [], read: false, seenSec: 0, error: false, atMs: null };
const listeners = new Set<() => void>();
const newListeners = new Set<(items: Notice[]) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const key = (w: string) => `mitoshi.notices.seen.${w}`;
const readSeen = (w: string) => {
  try {
    return Number(localStorage.getItem(key(w))) || 0;
  } catch {
    return 0;
  }
};
const set = (next: Partial<Snap>) => {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
};

async function poll() {
  const w = snap.wallet;
  if (!w || document.visibilityState !== "visible") return;
  const res = await fetch(`/api/notifications?wallet=${w}`, { cache: "no-store" }).catch(() => null);
  if (snap.wallet !== w) return;
  if (!res?.ok) return set({ error: true, read: true });
  const items = ((await res.json()) as { items: Notice[] }).items;
  const known = new Set(snap.items.map((i) => i.id));
  const fresh = snap.read ? items.filter((i) => !known.has(i.id)) : [];
  set({ items, read: true, error: false, atMs: Date.now() });
  if (fresh.length) newListeners.forEach((l) => l(fresh));
}

/** Follows `wallet` (null stops): the first read is silent; later new items reach `onNew` listeners. */
export function watchWallet(wallet: string | null): void {
  const w = wallet?.toLowerCase() ?? null;
  if (w === snap.wallet) return;
  if (timer) clearInterval(timer);
  timer = null;
  set({ wallet: w, items: [], read: false, seenSec: w ? readSeen(w) : 0, error: false, atMs: null });
  if (!w) return;
  void poll();
  timer = setInterval(() => void poll(), POLL_MS);
}

export function onNewNotices(l: (items: Notice[]) => void): () => void {
  newListeners.add(l);
  return () => newListeners.delete(l);
}

/** Everything up to now counts as seen (opening the centre). */
export function markSeen(): void {
  const w = snap.wallet;
  if (!w) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    localStorage.setItem(key(w), String(now));
  } catch {
    /* private mode: the badge just stays until the next visit */
  }
  set({ seenSec: now });
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const useNotices = () => useSyncExternalStore(subscribe, () => snap, () => snap);
export const useUnread = () => useSyncExternalStore(subscribe, () => snap.items.filter((i) => i.atSec > snap.seenSec).length, () => 0);
export { poll as refreshNotices };
