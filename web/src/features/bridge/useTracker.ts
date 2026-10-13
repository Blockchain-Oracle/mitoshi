"use client";
/**
 * The in-flight tracker (R4-12, D-227; S14w E.3 "never a bare spinner"): follows one transfer live from LayerZero Scan
 * and the receipts (`@cwf/markets/stocks` `observeTransfer` → `@cwf/core` `advanceTransfer`, the same decision ops
 * `bridge-watch` persists), every 5 s until it ends (a held credit every 30 s until it is released). It survives a
 * killed tab: the last transfer is kept in this browser (`localStorage`, a convenience only) and `/bridge?tx=<hash>`
 * restores any recorded transfer from `/api/bridge/[guid]`.
 */
import { advanceTransfer, isBridgeTicker, type BridgeAdvance, type BridgeDirection, type BridgeEta, type BridgeTicker, type Hex, type LegRecord } from "@cwf/core";
import { observeTransfer } from "@cwf/markets/stocks";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { bridgeClients, NETWORK } from "./useBridge";

export interface Tracked {
  direction: BridgeDirection;
  ticker: BridgeTicker;
  srcTx: Hex;
  /** 6-dp amount as a decimal string. */
  amountSD: string;
  startedAtMs: number;
}

const STORE = `cwf.bridge.last.${NETWORK}`;
const POLL_MS = 5_000;
/** A held credit is re-read slowly until the holder claims or sends it back (then it reads "released"). */
const HELD_POLL_MS = 30_000;
const ENDED = new Set(["delivered", "released", "returned", "reverted", "failed"]);
/** A kept transfer older than this is not reopened on its own (the server record and Recent still have it). */
const KEEP_MS = 24 * 3600_000;

function load(): Tracked | null {
  try {
    const raw = localStorage.getItem(STORE);
    const t = raw ? (JSON.parse(raw) as Tracked) : null;
    return t && isBridgeTicker(t.ticker) && /^0x[0-9a-fA-F]{64}$/.test(t.srcTx) && Date.now() - t.startedAtMs < KEEP_MS ? t : null;
  } catch {
    return null;
  }
}

function save(t: Tracked | null) {
  try {
    if (t) localStorage.setItem(STORE, JSON.stringify(t));
    else localStorage.removeItem(STORE);
  } catch {
    // Private mode or blocked storage: the server record still restores it.
  }
}

/** A recorded transfer by its source hash or guid; null when it was never recorded (or no database is configured). */
export async function fetchRecorded(key: string): Promise<Tracked | null> {
  const res = await fetch(`/api/bridge/${key}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const { transfer: t } = (await res.json()) as { transfer: { direction: BridgeDirection; ticker: string; srcTx: Hex; amountSD: string; createdAtMs: number } };
  return isBridgeTicker(t.ticker) ? { direction: t.direction, ticker: t.ticker, srcTx: t.srcTx, amountSD: t.amountSD, startedAtMs: t.createdAtMs } : null;
}

export function useTracker(eta: { in: BridgeEta | null; out: BridgeEta | null } | null, restoreKey: string | null) {
  const [tracked, setTracked] = useState<Tracked | null>(null);
  /** A restore by key that found nothing (not recorded, or no database): the caller says so instead of waiting. */
  const [missing, setMissing] = useState(false);
  const legs = useRef<LegRecord[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const restored = restoreKey ? await fetchRecorded(restoreKey) : null;
      // The transfer kept in this browser stands in only for itself (or when no key was asked for).
      const kept = load();
      const next = restored ?? (kept && (!restoreKey || kept.srcTx.toLowerCase() === restoreKey.toLowerCase()) ? kept : null);
      if (!live) return;
      setTracked(next);
      setMissing(restoreKey !== null && next === null);
    })();
    return () => {
      live = false;
    };
  }, [restoreKey]);

  const start = useCallback((t: Tracked) => {
    legs.current = [];
    save(t);
    setMissing(false);
    setTracked(t);
  }, []);
  const clear = useCallback(() => {
    legs.current = [];
    save(null);
    setTracked(null);
  }, []);

  const etaFor = tracked ? (eta?.[tracked.direction] ?? null) : null;
  const state = useQuery({
    queryKey: ["bridge", NETWORK, "track", tracked?.srcTx ?? ""],
    enabled: tracked !== null,
    queryFn: async (): Promise<BridgeAdvance> => {
      const t = tracked!;
      const obs = await observeTransfer(await bridgeClients(), { ...t, amountSD: BigInt(t.amountSD) });
      const next = advanceTransfer({ direction: t.direction, network: NETWORK, srcTx: t.srcTx, legs: legs.current, createdAtMs: t.startedAtMs }, obs, etaFor, Date.now());
      legs.current = next.legs;
      return next;
    },
    refetchInterval: (q) => (!q.state.data ? POLL_MS : ENDED.has(q.state.data.status) ? false : q.state.data.status === "deferred" ? HELD_POLL_MS : POLL_MS),
    refetchIntervalInBackground: false,
  });

  // A transfer that ended is no longer reopened on a later visit (this one keeps showing it until "Bridge again"); only
  // the one kept in this browser is forgotten (the drawer may be showing another).
  const ended = state.data ? ENDED.has(state.data.status) : false;
  const endedTx = ended ? (tracked?.srcTx ?? null) : null;
  useEffect(() => {
    if (endedTx && load()?.srcTx === endedTx) save(null);
  }, [endedTx]);

  return { tracked, missing, start, clear, advance: state.data ?? null, error: state.error, eta: etaFor };
}

export type TrackerModel = ReturnType<typeof useTracker>;
