"use client";

// The duel's client state (R4-9, D-227; Masayume 68f7a09 web/src/features/games/duel/{useDuelRoom,useArenaWrites}.ts,
// over HTTP instead of the game room): where the wallet stands in the queue, the paired match as the arena says it, and
// the one write lane every duel call rides (core ArenaIntent → @cwf/markets' encoder → the submitter, passkey and
// pathUSD). The queue is polled every 2 s while waiting; the match every 3 s while it is live.
import type { Bytes32, TxIntent } from "@cwf/core";
import type { StakeTierId } from "@cwf/core/games";
import { useSubmitter } from "@cwf/markets/react";
import { diagnosisCopy } from "@cwf/core/copy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { DuelMatchWire, DuelQueueWire } from "./duel-wire";

const QUEUE_KEY = ["games", "duel", "queue"] as const;
const LIVE = new Set(["pending", "waiting", "activeUnrevealed", "picking", "settling", "forfeited"]);

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `the duel server answered ${res.status}`);
  return body;
}

function freshSeed(): Bytes32 {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function useDuelQueue(address: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...QUEUE_KEY, address],
    queryFn: async () => json<DuelQueueWire>(await fetch("/api/games/duel/queue", { cache: "no-store", credentials: "same-origin" })),
    enabled: address !== null,
    refetchInterval: (query) => (query.state.data?.status === "waiting" ? 2_000 : false),
  });
  const [error, setError] = useState<string | null>(null);
  const find = useCallback(
    async (tier: StakeTierId) => {
      setError(null);
      try {
        const wire = await json<DuelQueueWire>(await fetch("/api/games/duel/queue", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier, clientSeed: freshSeed() }) }));
        qc.setQueryData([...QUEUE_KEY, address], wire);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [qc, address],
  );
  const leave = useCallback(async () => {
    await fetch("/api/games/duel/queue", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    qc.setQueryData([...QUEUE_KEY, address], { status: "idle" } satisfies DuelQueueWire);
  }, [qc, address]);
  return { queue: q.data ?? null, loading: q.isLoading, error: error ?? (q.isError ? (q.error as Error).message : null), find, leave, refresh: () => qc.invalidateQueries({ queryKey: QUEUE_KEY }) };
}

export function useDuelMatch(matchId: string | null) {
  return useQuery({
    queryKey: ["games", "duel", "match", matchId],
    queryFn: async () => json<DuelMatchWire>(await fetch(`/api/games/duel/match/${matchId}`, { cache: "no-store", credentials: "same-origin" })),
    enabled: matchId !== null,
    refetchInterval: (query) => (!query.state.data || LIVE.has(query.state.data.status) ? 3_000 : false),
    retry: 1,
  });
}

export type WriteResult = { ok: boolean; kind: string | null };

/** One duel call through the submitter; `busy` names the call in flight, `failed` the last refusal in words. */
export function useDuelWrite(matchId: string | null) {
  const submitter = useSubmitter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const write = useCallback(
    async (key: string, intent: TxIntent, opts: { quietKinds?: readonly string[] } = {}): Promise<WriteResult> => {
      if (!submitter || busy) return { ok: false, kind: "busy" };
      setBusy(key);
      setFailed(null);
      try {
        const r = await submitter.submitTx(intent);
        if (r.status === "confirmed") return { ok: true, kind: null };
        if (!opts.quietKinds?.includes(r.diagnosis.kind)) setFailed(diagnosisCopy(r.diagnosis.kind).headline);
        return { ok: false, kind: r.diagnosis.kind };
      } catch (e) {
        setFailed(e instanceof Error ? e.message : String(e));
        return { ok: false, kind: "unknown" };
      } finally {
        setBusy(null);
        await qc.invalidateQueries({ queryKey: ["games", "duel", "match", matchId] });
      }
    },
    [submitter, busy, qc, matchId],
  );
  return { write, busy, failed, ready: submitter !== null };
}
