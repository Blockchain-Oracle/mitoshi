"use client";

/**
 * Live Window and wallet data (D-049, S4): the engine events S1's shared stream carries — each subscribed Window's
 * `market:<id>`, `markets`, `verdicts`, and the signed-in wallet's `user:<address>` (ticketed by the hub) — mark exactly
 * the reads they change as stale (`stream/dispatch.ts`), so the book, the snapshot, the lanes, the verdict card and the
 * Collect plate refresh on the event, not on a poll. Prices stay on S1's `usePriceStream`. When the stream cannot carry
 * the wallet's own topic (no session to mint its ticket: a wallet sign-in, an expired or lost passkey session), the
 * wallet's engine events are followed on the chain instead (D-049's chain logs, D-151) — same invalidations, no prompt.
 * Also the verdict card's and the Collect plate's reads.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, ClaimableRow, MarketId, PinnedVerdictView, Reading } from "@cwf/core";
import { streamState, subscribeTopic, subscribeUserGrant, userStreamGranted, type StreamEvent } from "../runtime/stream-hub";
import { coalesce, opsFor, type CacheOp } from "../stream/dispatch";
import { boardLive } from "../provider/board-reads";
import { useMarkets } from "./contexts";
import { keys } from "./keys";
import { useReadingQuery } from "./useReadingQuery";

export function useLiveMarketData({ marketIds = [], wallet = null }: { marketIds?: readonly MarketId[]; wallet?: Address | null }): void {
  const queryClient = useQueryClient();
  const topicKey = [...new Set(["markets", "verdicts", ...marketIds.map((m) => `market:${m.toLowerCase()}`), ...(wallet ? [`user:${wallet.toLowerCase()}`] : [])])].sort().join(",");
  useEffect(() => {
    const apply = (events: StreamEvent[]) => {
      const board = boardLive();
      const ops = coalesce(events.flatMap((e) => opsFor(e.event, { topic: e.topic, data: (e.data ?? {}) as Record<string, unknown> }, { board })));
      for (const op of ops) {
        if (op.kind === "set") queryClient.setQueryData(op.key, op.value);
        else void queryClient.invalidateQueries({ queryKey: op.key });
      }
    };
    const releases = topicKey.split(",").map((topic) => subscribeTopic(topic, apply));
    return () => releases.forEach((release) => release());
  }, [topicKey, queryClient]);
  useUserChainFallback(wallet);
}

/** Follows the wallet's own engine events on the chain while the stream carries no `user:` topic for it (D-151). */
function useUserChainFallback(wallet: Address | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!wallet) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const apply = (ops: CacheOp[]) => {
      for (const op of ops) if (op.kind === "invalidate") void queryClient.invalidateQueries({ queryKey: op.key });
    };
    const needed = () => userStreamGranted() === false || streamState() === "closed";
    const sync = () => {
      if (needed() && !stop) {
        // Loaded on use: a page whose stream carries the topic never pulls the watcher in.
        void Promise.all([import("../engine/lens"), import("../stream/user-logs")])
          .then(async ([lens, logs]) => {
            const venue = await lens.engineVenue();
            if (!cancelled && !stop && needed()) stop = logs.watchUserEngineLogs(venue.engine, wallet, apply);
          })
          .catch(() => undefined);
      } else if (!needed() && stop) {
        stop();
        stop = null;
      }
    };
    sync();
    const off = subscribeUserGrant(sync);
    return () => {
      cancelled = true;
      off();
      stop?.();
    };
  }, [wallet, queryClient]);
}

export function usePinnedVerdict(wallet: Address | null, marketId: MarketId | null): Reading<PinnedVerdictView | null> | null {
  const markets = useMarkets();
  return useReadingQuery(keys.verdict(wallet, marketId), () => markets.getPinnedVerdict(wallet!, marketId!), { enabled: wallet !== null && marketId !== null });
}

export function useClaimables(wallet: Address | null): Reading<ClaimableRow[]> | null {
  const markets = useMarkets();
  return useReadingQuery(keys.claimables(wallet), () => markets.listClaimables(wallet!), { enabled: wallet !== null });
}
