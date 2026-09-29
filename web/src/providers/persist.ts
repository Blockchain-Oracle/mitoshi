"use client";
// Ported from Masayume 68f7a09:web/src/providers/persist.ts

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { useEffect } from "react";

/**
 * The read cache that survives a reload.
 *
 * A hard refresh had no last-good anything: `withReading`'s memory lives for the life of the
 * document, so every returning user paid the full cold chain cost again, and the boot facts
 * alone measured 0.4-2.0 s of that.
 *
 * What is written to disk is a deliberately short list, and the rule is not "what would be
 * nice to have back" but "what can never be wrong about somebody". Every entry here is public,
 * chain-scoped and slowly changing. Nothing account-scoped is written at all — not a balance,
 * not a position, not a history page — so there is no account to purge on disconnect and no
 * way for one wallet's data to be shown to another. That is a stronger guarantee than a purge,
 * because a purge is a thing that can fail to run.
 *
 * Bump `SCHEMA_VERSION` whenever a persisted value's shape changes; with the chain id it is
 * the cache buster, and a namespace miss simply reads as "nothing stored".
 */
const SCHEMA_VERSION = 1;
const NAMESPACE = (chainId: number) => `cwf.read-cache.v${SCHEMA_VERSION}.${chainId}`;
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const WRITE_DEBOUNCE_MS = 1_000;

interface StoredEntry {
  key: QueryKey;
  value: unknown;
  storedAtMs: number;
}

/**
 * The allowlist.
 *
 * - a Series' grid (lot, tick, minimum): constant for the Series' life, by that read's own contract;
 * - the live lane list: public, marked `aged` until its own read confirms it (ux-audit R7).
 *
 * Everything else is refused on purpose. Live quotes, books and marks go stale in seconds and a
 * remembered price is a lie. Positions, balances, claims and history are account-scoped. Grants,
 * sessions and any pending transaction authority must never touch disk at all.
 */
export function isPersistable(key: QueryKey): boolean {
  const [scope, family] = key as readonly unknown[];
  return scope === "cwf" && (family === "bookParams" || family === "lanes");
}

/** A restored value is true but old: it says so until its own read confirms it. */
function aged(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const reading = value as { ok?: unknown; stale?: unknown };
  if (reading.ok !== true) return value;
  return { ...reading, stale: true, staleReason: "aged" };
}

async function restore(queryClient: QueryClient, namespace: string): Promise<void> {
  const stored = await get<StoredEntry[]>(namespace).catch(() => undefined);
  if (!stored) return;
  const now = Date.now();
  for (const entry of stored) {
    if (now - entry.storedAtMs > MAX_AGE_MS) continue;
    if (!isPersistable(entry.key)) continue;
    // Never overwrite a live answer that already arrived while the restore was in flight.
    if (queryClient.getQueryData(entry.key) !== undefined) continue;
    queryClient.setQueryData(entry.key, aged(entry.value));
  }
}

function collect(queryClient: QueryClient): StoredEntry[] {
  const now = Date.now();
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.status === "success" && query.state.data !== undefined && isPersistable(query.queryKey))
    .map((query) => ({ key: query.queryKey, value: query.state.data, storedAtMs: now }));
}

/**
 * Restores the allowlisted entries once, then keeps them written.
 *
 * Restoration deliberately does not block the application: the same reads are already in
 * flight, and a restored value that lands first simply opens their dependants sooner. Values
 * are stored by structured clone, so the `bigint`s in a book's parameters survive intact —
 * JSON would have quietly turned them into a string or thrown.
 */
export function usePersistedReadCache(queryClient: QueryClient, chainId: number): void {
  useEffect(() => {
    const namespace = NAMESPACE(chainId);
    void restore(queryClient, namespace);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || !isPersistable(event.query.queryKey)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const entries = collect(queryClient);
        void (entries.length > 0 ? set(namespace, entries) : del(namespace)).catch(() => undefined);
      }, WRITE_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [queryClient, chainId]);
}
