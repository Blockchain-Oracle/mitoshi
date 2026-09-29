/**
 * The shared read-only runtime (Masayume 68f7a09:packages/markets/src/runtime/read-runtime.ts, rebuilt on viem for
 * Tempo). One instance per browser tab or server process: the public client and its transports. It has NO account
 * and NO signer, so an endpoint rotation can never change any actor's signing authority; everything that signs owns
 * a `SubmitterSession` (../sessions).
 *
 * Transports (web-stack §4.4): WebSocket first for logs and heads, batched HTTP as the fallback; `readContract`
 * auto-batches through Multicall3 (one round trip per screen, plan §3.2 "Chain").
 */
import { createPublicClient, fallback, http, webSocket, type PublicClient, type Transport } from "viem";
import { tempoChain, type TempoChain } from "../chains";
import { parseMarketsEnv, type MarketsEnv } from "../env";

let env: MarketsEnv = parseMarketsEnv();
let client: PublicClient<Transport, TempoChain> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function transportFor(e: MarketsEnv): Transport {
  const https = e.rpcHttpUrls.map((url) => http(url, { batch: { batchSize: 50, wait: 8 }, retryCount: 2, timeout: 10_000 }));
  // A socket is only opened where one exists (browsers, Node ≥ 22); SSR renders stay on HTTP.
  const sockets = typeof WebSocket === "undefined" ? [] : e.rpcWsUrls.map((url) => webSocket(url, { keepAlive: { interval: 25_000 }, reconnect: { attempts: 5, delay: 2_000 } }));
  const all = [...sockets, ...https];
  return all.length === 1 ? all[0]! : fallback(all, { rank: false, retryCount: 1 });
}

/** Sets the runtime's config; the next `getPublicClient()` builds against it. Idempotent for equal configs. */
export function configureMarkets(next: MarketsEnv): void {
  if (JSON.stringify(next) === JSON.stringify(env) && client) return;
  env = next;
  closeRuntime();
}

export function marketsEnv(): MarketsEnv {
  return env;
}

/** The one read client for this process. */
export function getPublicClient(): PublicClient<Transport, TempoChain> {
  if (!client) {
    client = createPublicClient({ chain: tempoChain(env.network), transport: transportFor(env), batch: { multicall: { wait: 8 } } }) as PublicClient<Transport, TempoChain>;
    version += 1;
    for (const listener of listeners) listener();
  }
  return client;
}

/** Drops the client (tests, a config change); the next read builds a new one. */
export function closeRuntime(): void {
  client = null;
}

/** Bumps whenever the client is rebuilt, so subscriptions can re-attach. */
export function runtimeVersion(): number {
  return version;
}

export function subscribeRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
