"use client";
/**
 * `/api/bridge` from the browser (R4-12, D-227), kept light so Portfolio's "In flight" row doesn't load the bridge's
 * chain code: the accounts' recorded transfers with the measured ETA, and recording a transfer the moment its source
 * hash exists (before the receipt). A failed record only loses Recent — the funds move on chain regardless.
 */
import { STOP_CHAIN_ID, type BridgeDirection, type BridgeEta } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import { webEnv } from "@/lib/env";
import type { Tracked } from "./useTracker";

export const NETWORK = webEnv.markets.network;

export interface BridgeApi {
  transfers: { direction: BridgeDirection; ticker: string; srcTx: string; amountSD: string; status: string; createdAtMs: number; recipient: string }[];
  eta: { in: BridgeEta | null; out: BridgeEta | null };
}

export function useBridgeApi(addresses: readonly (string | null | undefined)[]) {
  const list = addresses.filter((a): a is string => Boolean(a));
  return useQuery({
    queryKey: ["bridge", NETWORK, "api", ...list],
    queryFn: async (): Promise<BridgeApi | null> => {
      const answers = await Promise.all((list.length ? list : [null]).map((a) => fetch(`/api/bridge${a ? `?address=${a}` : ""}`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<BridgeApi>) : null))));
      const ok = answers.filter((a): a is BridgeApi => a !== null);
      if (!ok.length) return null;
      const seen = new Set<string>();
      const transfers = ok.flatMap((a) => a.transfers).filter((t) => !seen.has(t.srcTx) && seen.add(t.srcTx)).sort((a, b) => b.createdAtMs - a.createdAtMs);
      return { transfers, eta: ok[0]!.eta };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** Records a transfer the moment its source hash exists (before the receipt). */
export async function recordTransfer(t: Tracked & { from: string; to: string }): Promise<void> {
  const srcChainId = STOP_CHAIN_ID[NETWORK][t.direction === "in" ? "robinhood" : "tempo"];
  await fetch("/api/bridge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: t.direction, ticker: t.ticker, srcChainId, srcTx: t.srcTx, from: t.from, to: t.to, amountSD: t.amountSD }) }).catch(() => undefined);
}

