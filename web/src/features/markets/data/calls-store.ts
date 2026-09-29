/**
 * The calls this account placed from this device (D-048 / ux-audit fix 2): the verdict pins to the user's own position,
 * not to the hero selection — the hero auto-advances to the next Window and the settler's auto-pay deletes the
 * position, so neither can be what keeps a call on screen. Each call stays until the user dismisses it or six hours
 * after its close; the chain decides what it shows (`getPinnedVerdict`). Kept per account in localStorage, best-effort.
 */
import type { Address, EventMarket, Hex, MarketId, Side } from "@cwf/core";

export interface PlacedCall {
  marketId: MarketId;
  asset: string;
  lane: EventMarket["lane"];
  intervalSec: number;
  tradingStartSec: number;
  expirySec: number;
  decimals: number;
  side: Side;
  contractsRaw: bigint;
  costBase: bigint;
  txHash: Hex;
  placedAtMs: number;
  /** A Listed Window's scheduled call rests until the open (D-088). */
  resting?: boolean;
}

const PREFIX = "cwf.calls.v1";
const KEEP_AFTER_CLOSE_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS = 12;

type Listener = () => void;
const listeners = new Set<Listener>();
const cache = new Map<string, PlacedCall[]>();
const EMPTY: PlacedCall[] = [];

const storageKey = (wallet: Address) => `${PREFIX}.${wallet.toLowerCase()}`;

function load(wallet: Address): PlacedCall[] {
  const key = storageKey(wallet);
  const hit = cache.get(key);
  if (hit) return hit;
  let calls: PlacedCall[] = [];
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    if (raw) calls = (JSON.parse(raw) as Record<string, unknown>[]).map((c) => ({ ...(c as unknown as PlacedCall), contractsRaw: BigInt(c.contractsRaw as string), costBase: BigInt(c.costBase as string) }));
  } catch {
    calls = [];
  }
  cache.set(key, calls);
  return calls;
}

function save(wallet: Address, calls: PlacedCall[]): void {
  const key = storageKey(wallet);
  cache.set(key, calls);
  try {
    window.localStorage.setItem(key, JSON.stringify(calls, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch {
    // storage unavailable: the calls still pin for this session
  }
  for (const l of listeners) l();
}

/** Pure: the list after recording `call` (newest first, one entry per Window: a second fill adds to the first). */
export function withCall(calls: readonly PlacedCall[], call: PlacedCall, nowMs: number): PlacedCall[] {
  const same = calls.find((c) => c.marketId === call.marketId && c.side === call.side);
  const merged: PlacedCall = same ? { ...call, contractsRaw: same.contractsRaw + call.contractsRaw, costBase: same.costBase + call.costBase, placedAtMs: same.placedAtMs } : call;
  return [merged, ...calls.filter((c) => c !== same)].filter((c) => c.expirySec * 1000 + KEEP_AFTER_CLOSE_MS > nowMs).slice(0, MAX_CALLS);
}

export function recordCall(wallet: Address, call: PlacedCall, nowMs: number = Date.now()): void {
  save(wallet, withCall(load(wallet), call, nowMs));
}

export function dismissCall(wallet: Address, marketId: MarketId): void {
  save(wallet, load(wallet).filter((c) => c.marketId !== marketId));
}

export function subscribeCalls(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function callsOf(wallet: Address | null): PlacedCall[] {
  return wallet ? load(wallet) : EMPTY;
}
