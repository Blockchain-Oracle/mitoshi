"use client";
/**
 * The NYSE session as ops sees it (S23c): the `session` stream topic (ops `/session`'s body — the agreed calendar's
 * state now, the next open, its label "Opens Mon 09:30 ET"), held once for the tab. The terminal reads it for the
 * notes a stock with no Window shows; the Windows themselves still come from the chain.
 */
import type { SessionState } from "@cwf/core";
import { subscribeTopic } from "@cwf/markets/stream";
import { useSyncExternalStore } from "react";
import { ensureStream } from "@/features/prices/stream-config";

export interface MarketSession {
  state: SessionState | null;
  nextOpenSec: number | null;
  label: string | null;
}

const EMPTY: MarketSession = { state: null, nextOpenSec: null, label: null };
let current: MarketSession = EMPTY;
const listeners = new Set<() => void>();
let off: (() => void) | null = null;

function parse(data: unknown): MarketSession | null {
  const d = data as { status?: { state?: unknown; nextOpenSec?: unknown } | null; label?: unknown };
  if (!d || typeof d !== "object") return null;
  const state = typeof d.status?.state === "string" ? (d.status.state as SessionState) : null;
  const nextOpenSec = typeof d.status?.nextOpenSec === "number" ? d.status.nextOpenSec : null;
  return { state, nextOpenSec, label: typeof d.label === "string" ? d.label : null };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!off && ensureStream()) {
    off = subscribeTopic("session", (events) => {
      const last = events.filter((e) => e.event === "session").at(-1);
      const next = last ? parse(last.data) : null;
      if (!next) return;
      current = next;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && off) {
      off();
      off = null;
    }
  };
}

export function useMarketSession(): MarketSession {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY);
}
