"use client";
/**
 * The NYSE session as ops agrees it (Alpaca ∩ RedStone, S3) and everything `/session` says about the lanes: the
 * roller's state per lane, halts, earnings and corporate skips (S6, G-12). One store for the tab, fed by the ops
 * stream's `session` topic (every minute and on a change) and its `halts` topic (the moment halt-watch confirms one),
 * replacing the terminal's own reader (S23c). Ported in purpose from Agari 03b30ab:web/src/features/markets/session/
 * useMarketSession.ts, which polled `/session`; the plan keeps one real-time stream (D40).
 */
import type { HaltAsset, HaltBoard } from "@cwf/core";
import { subscribeTopic } from "@cwf/markets/stream";
import { useRef, useSyncExternalStore } from "react";
import { nowMs, useClockValue } from "@/lib/clock";
import { ensureStream } from "@/features/prices/stream-config";
import { parseHaltBoard, parseSessionBody, toMarketSession, type MarketSession, type PrintsState, type SessionBody } from "./model";

let body: SessionBody | null = null;
/** The `halts` topic's board, newer than the body's own copy until the next `session` event carries it. */
let liveHalts: HaltBoard | null = null;
let version = 0;
const listeners = new Set<() => void>();
let off: (() => void) | null = null;

const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!off && ensureStream()) {
    const offSession = subscribeTopic("session", (events) => {
      const last = events.filter((e) => e.event === "session").at(-1);
      const next = last ? parseSessionBody(last.data) : null;
      if (!next) return;
      body = next;
      liveHalts = null;
      bump();
    });
    const offHalts = subscribeTopic("halts", (events) => {
      const last = events.filter((e) => e.event === "halts").at(-1);
      if (!last) return;
      liveHalts = parseHaltBoard(last.data);
      bump();
    });
    off = () => (offSession(), offHalts());
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && off) {
      off();
      off = null;
    }
  };
}

const getVersion = () => version;
const noVersion = () => 0;

/** The body with the freshest halt board, or null before ops has answered. */
function current(): SessionBody | null {
  return body && liveHalts ? { ...body, halts: liveHalts } : body;
}

/** What changes the value: the hour's state, its boundaries, and the asked-about asset's halt. */
function signatureAt(ms: number, asset: HaltAsset | undefined): string {
  const b = current();
  if (!b || ms === 0) return "";
  const s = toMarketSession(b, Math.floor(ms / 1000), asset);
  return s ? [s.status.state, s.status.date, s.status.nextOpenSec, s.status.closesAtSec, s.label, s.halt?.reason ?? ""].join("|") : "none";
}

/**
 * The session now, carrying `asset`'s halt (a ticker, or `<T>-24` for a stock's 24/7 lane). Null while unknown — before
 * ops answers, with no stream, or when the calendar disputes today — so a surface never prints hours nobody vouched
 * for. Re-renders when a fact changes (an event, a boundary passing, a halt), not on every clock tick.
 */
export function useMarketSession(asset?: HaltAsset): MarketSession | null {
  const v = useSyncExternalStore(subscribe, getVersion, noVersion);
  const signature = useClockValue((ms) => signatureAt(ms, asset));
  const held = useRef<{ key: string; value: MarketSession | null } | null>(null);
  const key = `${v}|${signature}`;
  if (held.current?.key !== key) {
    const b = current();
    held.current = { key, value: b && signature && signature !== "none" ? toMarketSession(b, Math.floor(nowMs() / 1000), asset) : null };
  }
  return held.current.value;
}

/** The price relay's word on the prints (`/session.prints`, D-230), or null before ops answers. */
export function usePrintsState(): PrintsState | null {
  useSyncExternalStore(subscribe, getVersion, noVersion);
  return body?.prints ?? null;
}
