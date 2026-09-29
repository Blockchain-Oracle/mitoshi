/**
 * What each engine event on the D-049 stream does to the query cache (pure): it marks exactly the reads it changes as
 * stale — the lens stays the only source that gates a write (canon #1). Prices are S1's (`usePriceStream` writes the
 * stream-owned `keys.price`); the connection is S1's shared hub (`runtime/stream-hub.ts`). Topics and events are ops'
 * (`services/ops/src/actors/indexer/window.ts` `topicsOf`).
 */
import type { QueryKey } from "@tanstack/react-query";
import { keys } from "../react/keys";

export type CacheOp = { kind: "set"; key: QueryKey; value: unknown } | { kind: "invalidate"; key: QueryKey };

export interface StreamFrame {
  topic: string;
  data: Record<string, unknown>;
}

/** Engine events whose Window's book, snapshot or list changes. */
const MARKET_EVENTS = new Set(["Fill", "OrderExecuted", "OrderRemoved", "OrderReduced", "CompleteSet", "PrintRecorded", "WindowResolved", "WindowOpened", "Redeemed", "CreditWithdrawn"]);

export function parseFrame(data: string): StreamFrame | null {
  try {
    const parsed = JSON.parse(data) as { topic?: unknown; data?: unknown };
    if (typeof parsed.topic !== "string" || typeof parsed.data !== "object" || parsed.data === null) return null;
    return { topic: parsed.topic, data: parsed.data as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** The cache operations one stream message implies. */
export function opsFor(event: string, frame: StreamFrame): CacheOp[] {
  const d = frame.data;
  if (!MARKET_EVENTS.has(event)) return [];
  const market = typeof d.market === "string" ? d.market.toLowerCase() : null;
  const ops: CacheOp[] = [];
  if (frame.topic.startsWith("user:")) {
    const wallet = frame.topic.slice(5);
    for (const key of [keys.balanceSheet(wallet), keys.positions(wallet), keys.claimables(wallet), keys.history(wallet)]) ops.push({ kind: "invalidate", key });
    if (market) ops.push({ kind: "invalidate", key: keys.verdict(wallet, market) });
    return ops;
  }
  if (market) {
    ops.push({ kind: "invalidate", key: keys.onchain(market) }, { kind: "invalidate", key: keys.depth(market) }, { kind: "invalidate", key: keys.market(market) });
  }
  if (event === "WindowOpened" || event === "WindowResolved") ops.push({ kind: "invalidate", key: keys.lanes() });
  if (event === "WindowResolved" && market) {
    // Every wallet's verdict and claimables on this Window move from "settling" to a stamp.
    ops.push({ kind: "invalidate", key: ["cwf", "verdict"] }, { kind: "invalidate", key: ["cwf", "claimables"] });
  }
  return ops;
}

/** Coalesces a frame's worth of operations: the last `set` per key wins, each invalidation once. */
export function coalesce(ops: readonly CacheOp[]): CacheOp[] {
  const sets = new Map<string, CacheOp>();
  const invalidations = new Map<string, CacheOp>();
  for (const op of ops) (op.kind === "set" ? sets : invalidations).set(JSON.stringify(op.key), op);
  return [...sets.values(), ...invalidations.values()];
}
