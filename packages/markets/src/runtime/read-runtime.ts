/**
 * The shared read-only runtime (Masayume 68f7a09:packages/markets/src/runtime/read-runtime.ts, rebuilt on viem for
 * Tempo). One instance per browser tab or server process: the public client and its transports. It has NO account
 * and NO signer, so an endpoint rotation can never change any actor's signing authority; everything that signs owns
 * a `SubmitterSession` (../sessions).
 *
 * Transports (web-stack §4.4): WebSocket first for logs and heads, batched HTTP as the fallback; `readContract`
 * auto-batches through Multicall3 (one round trip per screen, plan §3.2 "Chain").
 *
 * viem itself loads on the first read (`read-client.ts` via `import()`), so the config API here costs nothing in a
 * page's first-load JS (§3.1); every read is async anyway.
 */
import type { PublicClient, Transport } from "viem";
import type { TempoReadChain } from "../read-chain";
import { parseMarketsEnv, type MarketsEnv } from "../env";
import type { RpcBudget, RpcTier } from "../rpc-budget";

/** A server process's pace for this runtime's HTTP reads (ops' board cache, D-134); browsers never set one. */
export interface ReadBudget {
  budget: RpcBudget;
  tier: RpcTier;
}

let env: MarketsEnv = parseMarketsEnv();
export type ReadClient = PublicClient<Transport, TempoReadChain>;
let client: Promise<ReadClient> | null = null;
let logClient: Promise<ReadClient> | null = null;
let version = 0;
let readBudget: ReadBudget | null = null;
const listeners = new Set<() => void>();

/** Sets the runtime's config; the next `getPublicClient()` builds against it. Idempotent for equal configs. */
export function configureMarkets(next: MarketsEnv): void {
  if (JSON.stringify(next) === JSON.stringify(env) && client) return;
  env = next;
  closeRuntime();
}

/** Paces every HTTP read this runtime sends through `budget` (a server process); the next client built uses it. */
export function setReadBudget(next: ReadBudget | null): void {
  readBudget = next;
  closeRuntime();
}

export function marketsEnv(): MarketsEnv {
  return env;
}

/** The one read client for this process (viem loads with the first call). */
export function getPublicClient(): Promise<ReadClient> {
  if (!client) {
    const forEnv = env;
    const forBudget = readBudget;
    client = import("./read-client").then((m) => m.createReadClient(forEnv, forBudget));
    version += 1;
    for (const listener of listeners) listener();
  }
  return client;
}

/** The client for `eth_getLogs` (never batched: the gateway refuses log batches). */
export function getLogClient(): Promise<ReadClient> {
  if (!logClient) {
    const forEnv = env;
    const forBudget = readBudget;
    logClient = import("./read-client").then((m) => m.createLogClient(forEnv, forBudget));
  }
  return logClient;
}

/** Drops the clients (tests, a config change); the next read builds new ones. */
export function closeRuntime(): void {
  client = null;
  logClient = null;
}

/** Bumps whenever the client is rebuilt, so subscriptions can re-attach. */
export function runtimeVersion(): number {
  return version;
}

export function subscribeRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
