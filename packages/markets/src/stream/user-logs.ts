/**
 * The signed-in user's own engine events straight from the chain (D-049 "chain WebSocket logs for the user's own
 * events"; D-151): when the ops stream carries no `user:<address>` topic for this page — no server session to mint its
 * ticket (a wallet sign-in; a passkey session that expired or was lost) — the same events are watched on the engine
 * with the address as an indexed filter, and each one marks the same reads stale as its stream frame would
 * (`dispatch.ts` `opsFor` on the `user:` topic). The events and their user fields are ops' `topicsOf`
 * (`services/ops/src/actors/indexer/window.ts`); every one of those fields is indexed on `EventsEngine`.
 */
import type { AbiEvent, Address, Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { watchChainLogs } from "../runtime/chain-logs";
import { coalesce, opsFor, type CacheOp } from "./dispatch";

/** Event → the indexed argument that names the user (one watch each: viem filters args per single event). */
export const USER_EVENT_FIELDS: readonly (readonly [string, string])[] = [
  ["Fill", "taker"],
  ["Fill", "maker"],
  ["OrderExecuted", "taker"],
  ["OrderRemoved", "owner"],
  ["OrderReduced", "owner"],
  ["CompleteSet", "owner"],
  ["CreditWithdrawn", "owner"],
  ["Redeemed", "holder"],
];

const eventAbi = (name: string) => (eventsEngineAbi as readonly { type: string; name?: string }[]).find((x) => x.type === "event" && x.name === name) as AbiEvent;

export interface UserLog {
  eventName?: string;
  /** `topics[1]` is the Window id: `marketId` is the first indexed field of every engine event. */
  topics: readonly (Hex | null)[];
}

/** The cache operations a batch of the user's own logs implies — exactly what the `user:` frames would. */
export function opsForUserLogs(wallet: Address, logs: readonly UserLog[]): CacheOp[] {
  const topic = `user:${wallet.toLowerCase()}`;
  return coalesce(logs.flatMap((log) => (log.eventName ? opsFor(log.eventName, { topic, data: log.topics[1] ? { market: log.topics[1] } : {} }) : [])));
}

/** Watches the wallet's engine events; `onOps` gets each frame's coalesced cache operations. Returns the unwatch. */
export function watchUserEngineLogs(engine: Address, wallet: Address, onOps: (ops: CacheOp[]) => void): () => void {
  const stops = USER_EVENT_FIELDS.map(([name, field]) =>
    watchChainLogs({ address: engine, events: [eventAbi(name)], args: { [field]: wallet }, onLogs: (logs) => onOps(opsForUserLogs(wallet, logs as unknown as UserLog[])) }),
  );
  return () => stops.forEach((stop) => stop());
}
