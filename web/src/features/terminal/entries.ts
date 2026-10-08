// Ported from Owarine ecb7565b:web/src/features/terminal/entries.ts — key renamed `cwf.trade.entries.v1`.
"use client";

import { useSyncExternalStore } from "react";
import { persistSoon } from "./persist";

/**
 * What the chain does not hold about a position but the screen needs: the spot when it was opened (the chart's
 * Entry line and PnL band) and an armed trail stop. Kept per Window side in this browser; a position opened elsewhere
 * simply has no entry line.
 */
export interface EntryRecord {
  spot: number;
  atMs: number;
  trailStop: number | null;
  /** Take-profit and stop-loss on what Close pays, base units as decimal strings (23e, D-197); absent when unset. */
  tpBase?: string | null;
  slBase?: string | null;
}

const KEY = "cwf.trade.entries.v1";
const MAX_AGE_MS = 7 * 86_400_000;
const listeners = new Set<() => void>();
let entries: Record<string, EntryRecord> = {};
let hydrated = false;

const keyOf = (marketId: string, side: string) => `${marketId}:${side}`;

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, EntryRecord>) : {};
    const cutoff = Date.now() - MAX_AGE_MS;
    entries = Object.fromEntries(Object.entries(parsed).filter(([, e]) => typeof e?.spot === "number" && e.atMs > cutoff));
  } catch {
    entries = {};
  }
}

function commit(): void {
  persistSoon(KEY, () => entries);
  listeners.forEach((l) => l());
}

export function rememberEntry(marketId: string, side: string, spot: number, trailStop?: number | null): void {
  hydrate();
  const prev = entries[keyOf(marketId, side)];
  entries = { ...entries, [keyOf(marketId, side)]: { ...prev, spot: prev?.spot && trailStop !== undefined ? prev.spot : spot, atMs: prev?.atMs ?? Date.now(), trailStop: trailStop === undefined ? (prev?.trailStop ?? null) : trailStop } };
  commit();
}

/** Sets or clears the position's take-profit and stop-loss (exit-value targets). */
export function setExits(marketId: string, side: string, exits: { tpBase: bigint | null; slBase: bigint | null }, spot: number): void {
  hydrate();
  const prev = entries[keyOf(marketId, side)];
  entries = { ...entries, [keyOf(marketId, side)]: { spot: prev?.spot ?? spot, atMs: prev?.atMs ?? Date.now(), trailStop: prev?.trailStop ?? null, tpBase: exits.tpBase?.toString() ?? null, slBase: exits.slBase?.toString() ?? null } };
  commit();
}

export function forgetEntry(marketId: string, side: string): void {
  hydrate();
  const { [keyOf(marketId, side)]: _gone, ...rest } = entries;
  entries = rest;
  commit();
}

export function useEntries(): Record<string, EntryRecord> {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => (hydrate(), entries),
    () => entries,
  );
}

export const entryOf = (all: Record<string, EntryRecord>, marketId: string, side: string): EntryRecord | null => all[keyOf(marketId, side)] ?? null;
