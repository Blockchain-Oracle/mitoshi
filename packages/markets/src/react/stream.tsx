"use client";

/**
 * The real-time layer for React (D-049): `useMarketStream` opens the one SSE stream for the topics the page needs and
 * writes it into the QueryClient (per animation frame); `usePrice` reads a stream-owned price key (`staleTime:
 * Infinity`, never fetched — the stream's `prices` snapshot fills it on connect); `usePinnedVerdict` and
 * `useClaimables` are the verdict card's and the Collect plate's reads, refreshed by the user's own events.
 * No polling in hidden tabs: the stream is the only live source.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, AssetPrice, ClaimableRow, MarketId, PinnedVerdictView, Reading } from "@cwf/core";
import { openMarketStream } from "../stream/client";
import { keys } from "./keys";
import { useMarkets, useMarketsEnv } from "./provider";
import { useReadingQuery } from "./useReadingQuery";

export type StreamStatus = "idle" | "open" | "reconnecting" | "closed";

export interface MarketStreamInput {
  /** Public topics (`prices`, `markets`, `verdicts`, `market:<id>`, `symbol:<T>`). */
  topics: readonly string[];
  /** The signed-in wallet: adds `user:<address>` once `getTicket` yields a ticket. */
  wallet?: Address | null;
  /** Mints the 60 s per-user ticket (the web's `/api/stream/ticket`). */
  getTicket?: (wallet: Address) => Promise<string | null>;
}

export function useMarketStream({ topics, wallet = null, getTicket }: MarketStreamInput): StreamStatus {
  const env = useMarketsEnv();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("idle");
  const topicKey = [...topics].sort().join(",");
  useEffect(() => {
    if (!env.streamUrl) return;
    let closed = false;
    let connection: { close(): void } | null = null;
    void (async () => {
      const ticket = wallet && getTicket ? await getTicket(wallet).catch(() => null) : null;
      if (closed) return;
      const all = ticket && wallet ? [...topicKey.split(",").filter(Boolean), `user:${wallet.toLowerCase()}`] : topicKey.split(",").filter(Boolean);
      connection = openMarketStream({ streamUrl: env.streamUrl!, topics: all, ticket, queryClient, onStatus: (s) => setStatus(s) });
    })();
    return () => {
      closed = true;
      connection?.close();
    };
  }, [env.streamUrl, topicKey, wallet, getTicket, queryClient]);
  return status;
}

/** The latest signed quote for an ops key (`TSLA`, `TSLA-24`, `BTC`), written by the stream only. */
export function usePrice(key: string): AssetPrice | null {
  const query = useQuery<AssetPrice | null>({ queryKey: keys.price(key), queryFn: () => null, staleTime: Infinity, enabled: false });
  return query.data ?? null;
}

export function usePinnedVerdict(wallet: Address | null, marketId: MarketId | null): Reading<PinnedVerdictView | null> | null {
  const markets = useMarkets();
  return useReadingQuery(keys.verdict(wallet, marketId), () => markets.getPinnedVerdict(wallet!, marketId!), { enabled: wallet !== null && marketId !== null });
}

export function useClaimables(wallet: Address | null): Reading<ClaimableRow[]> | null {
  const markets = useMarkets();
  return useReadingQuery(keys.claimables(wallet), () => markets.listClaimables(wallet!), { enabled: wallet !== null });
}
