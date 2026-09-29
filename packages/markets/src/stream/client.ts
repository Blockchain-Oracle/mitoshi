/**
 * The one real-time layer (D-049): one SSE stream per client from ops (`<stream>/v1/stream?topics=…`), carrying prices,
 * fills, verdicts and the user's own events (`user:<address>` with a 60 s ticket), written into TanStack Query with
 * `setQueryData` / `invalidateQueries`, batched per animation frame (`setTimeout` where there is no frame, e.g. Node).
 */
import type { QueryClient } from "@tanstack/react-query";
import { connectSse, type SseConnection } from "./sse";
import { coalesce, opsFor, parseFrame, type CacheOp } from "./dispatch";

export interface MarketStreamOptions {
  streamUrl: string;
  topics: readonly string[];
  /** A per-user ticket (`/api/stream/ticket`) when a `user:` topic is asked for. */
  ticket?: string | null;
  queryClient: Pick<QueryClient, "setQueryData" | "invalidateQueries">;
  fetcher?: typeof fetch;
  onStatus?: (status: "open" | "reconnecting" | "closed", detail?: string) => void;
  /** Observes every applied batch (tests, drives). */
  onBatch?: (ops: CacheOp[]) => void;
}

export type Scheduler = (flush: () => void) => void;

const frameScheduler: Scheduler = (flush) => {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
  if (raf) raf(flush);
  else setTimeout(flush, 16);
};

/** Queues operations and applies them once per frame. */
export function createFrameBatcher(apply: (ops: CacheOp[]) => void, schedule: Scheduler = frameScheduler) {
  let queue: CacheOp[] = [];
  let pending = false;
  return (ops: readonly CacheOp[]) => {
    if (ops.length === 0) return;
    queue.push(...ops);
    if (pending) return;
    pending = true;
    schedule(() => {
      pending = false;
      const batch = coalesce(queue);
      queue = [];
      apply(batch);
    });
  };
}

export function streamUrlFor(base: string, topics: readonly string[], ticket?: string | null): string {
  const params = new URLSearchParams({ topics: [...new Set(topics)].join(",") });
  if (ticket) params.set("ticket", ticket);
  return `${base.replace(/\/$/, "")}/v1/stream?${params}`;
}

export function openMarketStream(opts: MarketStreamOptions): SseConnection {
  const batch = createFrameBatcher((ops) => {
    for (const op of ops) {
      if (op.kind === "set") opts.queryClient.setQueryData(op.key, op.value);
      else void opts.queryClient.invalidateQueries({ queryKey: op.key });
    }
    opts.onBatch?.(ops);
  });
  return connectSse({
    url: streamUrlFor(opts.streamUrl, opts.topics, opts.ticket),
    ...(opts.fetcher ? { fetcher: opts.fetcher } : {}),
    ...(opts.onStatus ? { onStatus: opts.onStatus } : {}),
    onMessage: (m) => {
      const frame = parseFrame(m.data);
      if (frame) batch(opsFor(m.event, frame));
    },
  });
}
