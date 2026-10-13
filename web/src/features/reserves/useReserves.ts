"use client";
/**
 * `/reserves`' data (R4-12, D-227): every chain read in this browser through `@cwf/markets/stocks` `readReserves`
 * (Moderato and Base today; Robinhood once its lockboxes exist), carrying the ISSUER_ROLE holder set from ops
 * reserve-watch's newest snapshot so a check scans only the blocks since; `/api/reserves` adds the 30-day history and
 * the alert log. Re-check walks the chains one by one (Robinhood · Base · Tempo), says which block each answered at,
 * and runs the full role scan when no snapshot exists yet.
 */
import { isBridgeTicker, reserveVerdict, type BridgeTicker, type Reading, type ReserveVerdict } from "@cwf/core";
import { bridgeTopology, browserBridgeClients, issuerScansOf, readReserves, type KnownIssuers, type ReservesView } from "@cwf/markets/stocks";
import { useReadingQuery } from "@cwf/markets/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { TaskStep } from "@/components/ui/task-steps";
import { webEnv } from "@/lib/env";
import { RESERVES } from "./copy";

interface Snapshot {
  ticker: string;
  atMs: number;
  tempoBlock: string;
  issuers: string[] | null;
  issuersToBlock: string | null;
  verdict: ReserveVerdict;
  alert: string | null;
}

export interface ReserveHistory {
  latest: Snapshot[];
  days: Record<string, { day: string; verdict: ReserveVerdict; snapshots: number }[]>;
  alerts: Snapshot[];
}

export interface RecheckEntry {
  atMs: number;
  verdict: ReserveVerdict;
  tempoBlock: string;
}

const network = webEnv.markets.network;
const KEY = ["reserves", network] as const;

async function fetchHistory(): Promise<ReserveHistory | null> {
  const res = await fetch("/api/reserves", { cache: "no-store" });
  return res.ok ? ((await res.json()) as ReserveHistory) : null;
}

function knownFrom(history: ReserveHistory | null | undefined): KnownIssuers {
  const out: KnownIssuers = {};
  for (const s of history?.latest ?? []) {
    if (isBridgeTicker(s.ticker) && s.issuers && s.issuersToBlock) out[s.ticker as BridgeTicker] = { holders: s.issuers as `0x${string}`[], toBlock: BigInt(s.issuersToBlock) };
  }
  return out;
}

export function useReserves() {
  const qc = useQueryClient();
  const history = useQuery({ queryKey: [...KEY, "history"], queryFn: fetchHistory, staleTime: 60_000, refetchInterval: 5 * 60_000, retry: 1 });
  // The role scan this tab ran on a Re-check outlives the snapshot it started from (newer cursor wins).
  const [scanned, setScanned] = useState<KnownIssuers>({});
  const known = useMemo(() => {
    const out = knownFrom(history.data);
    for (const [t, k] of Object.entries(scanned) as [BridgeTicker, KnownIssuers[BridgeTicker]][]) if (k && (!out[t] || out[t]!.toBlock < k.toBlock)) out[t] = k;
    return out;
  }, [history.data, scanned]);
  const knownKey = Object.values(known).map((k) => k.toBlock.toString()).join(",");
  const view = useReadingQuery<ReservesView>([...KEY, "view", knownKey], async () => readReserves(await browserBridgeClients(network), known), { enabled: !history.isPending, pollMs: 60_000 });
  const [steps, setSteps] = useState<TaskStep[] | null>(null);
  const [log, setLog] = useState<RecheckEntry[]>([]);

  const recheck = useCallback(async () => {
    const clients = await browserBridgeClients(network);
    const s: TaskStep[] = [
      { id: "robinhood", label: RESERVES.steps.robinhood, status: "active" },
      { id: "base", label: RESERVES.steps.base, status: "pending" },
      { id: "tempo", label: RESERVES.steps.tempo, status: "pending" },
    ];
    const put = (i: number, patch: Partial<TaskStep>) => {
      s[i] = { ...s[i]!, ...patch };
      setSteps([...s]);
    };
    setSteps([...s]);
    const block = (n: bigint) => `#${n.toLocaleString("en-US")}`;
    // No lockbox on Robinhood Chain yet: nothing there to re-read, and the step says so rather than ticking.
    const rhLive = Object.values(bridgeTopology(network).tickers).some((t) => t.lockbox);
    if (!rhLive) put(0, { status: "skipped", meta: RESERVES.notLive });
    else {
      try {
        put(0, { status: "done", meta: block(await clients.robinhood.getBlockNumber()) });
      } catch {
        put(0, { status: "error" });
      }
    }
    put(1, { status: "active" });
    try {
      put(1, { status: clients.base ? "done" : "skipped", meta: clients.base ? block(await clients.base.getBlockNumber()) : undefined });
    } catch {
      put(1, { status: "error" });
    }
    put(2, { status: "active" });
    const fresh: Reading<ReservesView> = await readReserves(clients, known, { fullIssuerScan: Object.keys(known).length === 0 });
    if (!fresh.ok) return put(2, { status: "error" });
    put(2, { status: "done", meta: block(fresh.value.blocks.tempo) });
    qc.setQueryData([...KEY, "view", knownKey], fresh);
    setScanned(issuerScansOf(fresh.value));
    setLog((l) => [{ atMs: Date.now(), verdict: reserveVerdict(fresh.value.tickers.map((t) => t.check)), tempoBlock: fresh.value.blocks.tempo.toString() }, ...l].slice(0, 20));
  }, [known, knownKey, qc]);

  return { view, history: history.data ?? null, steps, log, recheck };
}
