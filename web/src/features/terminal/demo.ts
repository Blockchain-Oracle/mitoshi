"use client";
// Ported from Owarine 90a91d71:web/src/features/terminal/mode.ts (P1, D-223) — DEMO: signed out, the terminal trades on
// paper. 10,000 paper dollars kept in this browser; a call fills at the live book's price, a Close pays what Close
// would pay, and a position still open at its Window's close settles on the real signed result. The balance moves by
// realized PnL only (margin is never taken at open), as on the reference. Amounts are base units (6 decimals).
import type { Side } from "@cwf/core";
import { useSyncExternalStore } from "react";
import { useWalletSession } from "@/lib/wallet-session";
import { persistSoon } from "./persist";

export type TradeMode = "demo" | "live";

export interface PaperPosition {
  id: string;
  marketId: string;
  asset: string;
  intervalSec: number;
  expirySec: number;
  side: Side;
  contractsRaw: string;
  costBase: string;
  entrySpot: number;
  openedAtMs: number;
}

export interface PaperTrade {
  id: string;
  kind: "close" | "trail" | "settle" | "reduce";
  asset: string;
  side: Side;
  intervalSec: number;
  costBase: string;
  pnlBase: string;
  openedAtMs: number;
  closedAtMs: number;
  /** A settle on a voided Window (it paid half a dollar a contract): neither a win nor a loss. */
  voided?: boolean;
  /** The Window's close, which the history row shows as the wallet's rows do (a settle can be recorded long after it). */
  expirySec?: number;
}

interface DemoState {
  balanceBase: string;
  positions: PaperPosition[];
  history: PaperTrade[];
}

export const DEMO_START_BASE = 10_000_000_000n;
const KEY = "mitoshi.demo.v1";
const HISTORY_CAP = 500;
const INITIAL: DemoState = { balanceBase: DEMO_START_BASE.toString(), positions: [], history: [] };

const listeners = new Set<() => void>();
let state: DemoState = INITIAL;
let hydrated = false;

const isPosition = (p: unknown): p is PaperPosition => {
  const x = p as PaperPosition;
  return typeof x?.id === "string" && typeof x.marketId === "string" && (x.side === "up" || x.side === "down") && /^\d+$/.test(x.contractsRaw ?? "") && /^\d+$/.test(x.costBase ?? "");
};

/** A stored paper trade the history can read: its money in base units, as integer strings. */
const isTrade = (t: unknown): t is PaperTrade => {
  const x = t as PaperTrade;
  return typeof x?.id === "string" && /^\d+$/.test(x.costBase ?? "") && /^-?\d+$/.test(x.pnlBase ?? "");
};

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<DemoState>;
    state = {
      balanceBase: typeof p.balanceBase === "string" && /^-?\d+$/.test(p.balanceBase) ? p.balanceBase : INITIAL.balanceBase,
      positions: Array.isArray(p.positions) ? p.positions.filter(isPosition) : [],
      history: Array.isArray(p.history) ? p.history.filter(isTrade).slice(0, HISTORY_CAP) : [],
    };
  } catch {
    state = INITIAL;
  }
}

function commit(next: DemoState): void {
  state = next;
  persistSoon(KEY, () => state);
  listeners.forEach((l) => l());
}

export function demoState(): DemoState {
  hydrate();
  return state;
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (hydrate(), state),
    () => INITIAL,
  );
}

/** From the connection alone (Owarine: no Paper/Live picker): signed out is DEMO, an account is live. */
export function useTradeMode(): TradeMode {
  const { address } = useWalletSession();
  return address ? "live" : "demo";
}

export function resetDemo(): void {
  hydrate();
  commit({ ...state, balanceBase: DEMO_START_BASE.toString(), positions: [] });
}

/** Opens a paper position, or adds to the one already open on that Window side. */
export function openPaper(p: PaperPosition): void {
  hydrate();
  const existing = state.positions.find((x) => x.marketId === p.marketId && x.side === p.side);
  if (!existing) return commit({ ...state, positions: [...state.positions, p] });
  const a = Number(existing.costBase);
  const b = Number(p.costBase);
  const merged: PaperPosition = {
    ...existing,
    contractsRaw: (BigInt(existing.contractsRaw) + BigInt(p.contractsRaw)).toString(),
    costBase: (BigInt(existing.costBase) + BigInt(p.costBase)).toString(),
    entrySpot: a + b > 0 ? (existing.entrySpot * a + p.entrySpot * b) / (a + b) : p.entrySpot,
  };
  commit({ ...state, positions: state.positions.map((x) => (x.id === existing.id ? merged : x)) });
}

/** Settles all or part of a paper position: the balance moves by realized PnL; `keep` leaves the rest open (Reduce). */
export function settlePaper(id: string, trade: Omit<PaperTrade, "id">, keep?: { contractsRaw: bigint; costBase: bigint }): void {
  hydrate();
  const balance = BigInt(state.balanceBase) + BigInt(trade.pnlBase);
  const positions = keep && keep.contractsRaw > 0n
    ? state.positions.map((p) => (p.id === id ? { ...p, contractsRaw: keep.contractsRaw.toString(), costBase: keep.costBase.toString() } : p))
    : state.positions.filter((p) => p.id !== id);
  commit({ ...state, balanceBase: balance.toString(), positions, history: [{ ...trade, id: `${id}:${trade.closedAtMs}` }, ...state.history].slice(0, HISTORY_CAP) });
}

