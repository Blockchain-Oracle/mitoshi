/**
 * The viem half of the read runtime, loaded by `getPublicClient()` on the first read (§3.1). Transports (web-stack
 * §4.4): WebSocket first for logs and heads, batched HTTP as the fallback; `readContract` auto-batches through
 * Multicall3.
 */
import { createPublicClient, fallback, http, webSocket, type Transport } from "viem";
import type { MarketsEnv } from "../env";
import { tempoReadChain } from "../read-chain";
import type { ReadClient } from "./read-runtime";

function transportFor(e: MarketsEnv): Transport {
  const https = e.rpcHttpUrls.map((url) => http(url, { batch: { batchSize: 50, wait: 8 }, retryCount: 2, timeout: 10_000 }));
  // A socket is only opened where one exists (browsers, Node ≥ 22); SSR renders stay on HTTP.
  const sockets = typeof WebSocket === "undefined" ? [] : e.rpcWsUrls.map((url) => webSocket(url, { keepAlive: { interval: 25_000 }, reconnect: { attempts: 5, delay: 2_000 } }));
  const all = [...sockets, ...https];
  return all.length === 1 ? all[0]! : fallback(all, { rank: false, retryCount: 1 });
}

export function createReadClient(env: MarketsEnv): ReadClient {
  return createPublicClient({ chain: tempoReadChain(env.network), transport: transportFor(env), batch: { multicall: { wait: 8 } } }) as ReadClient;
}
