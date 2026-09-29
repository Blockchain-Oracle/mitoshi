/**
 * Chain logs for the real-time client (plan S1 1b, D-040): contract events from the read runtime's transport
 * (WebSocket `eth_subscribe` first, polled HTTP as its fallback), delivered in one batch per frame and unwatched while
 * the page is hidden (re-watched from the head when shown; the stream's replay and the next reads cover the gap).
 * Area readers (the engine in S4, the vault in S7) register their events through this.
 */
import type { AbiEvent, Address, Log } from "viem";
import { createFrameBatcher } from "./frame-batch";
import { getPublicClient } from "./read-runtime";
import { documentVisibility, type StreamVisibility } from "./stream";

export interface ChainLogWatch {
  address: Address | readonly Address[];
  events: readonly AbiEvent[];
  /** Indexed-argument filter; viem applies it only when exactly one event is watched (`events.length === 1`). */
  args?: Record<string, unknown>;
  onLogs: (logs: Log[]) => void;
  visibility?: StreamVisibility | null;
  schedule?: (run: () => void) => void;
}

export function watchChainLogs(watch: ChainLogWatch): () => void {
  const visibility = watch.visibility === undefined ? documentVisibility() : watch.visibility;
  const batcher = createFrameBatcher<Log>(watch.onLogs, watch.schedule);
  let unwatch: (() => void) | null = null;
  let stopped = false;
  let generation = 0;

  const start = async () => {
    const mine = ++generation;
    const client = await getPublicClient();
    if (stopped || mine !== generation || visibility?.hidden()) return;
    const [only] = watch.events;
    if (watch.args && watch.events.length !== 1) throw new Error("watchChainLogs: args filter needs exactly one event");
    unwatch = client.watchEvent({
      address: watch.address as Address[],
      ...(watch.events.length === 1 ? { event: only as AbiEvent, ...(watch.args ? { args: watch.args as never } : {}) } : { events: watch.events as AbiEvent[] }),
      onLogs: (logs) => {
        for (const log of logs) batcher.push(log as Log);
      },
      onError: () => undefined,
    });
  };
  const pause = () => {
    generation += 1;
    unwatch?.();
    unwatch = null;
  };

  const off = visibility?.subscribe(() => (visibility.hidden() ? pause() : void start()));
  void start();
  return () => {
    stopped = true;
    off?.();
    pause();
  };
}
