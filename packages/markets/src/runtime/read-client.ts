/**
 * The viem half of the read runtime, loaded by `getPublicClient()` on the first read (§3.1). Transports (web-stack
 * §4.4): WebSocket first for logs and heads, HTTP (unbatched, D-130) as the fallback; `readContract` auto-batches through
 * Multicall3.
 */
import { createPublicClient, fallback, webSocket, type Transport } from "viem";
import { MULTICALL_CHUNK_BYTES, tempoHttp } from "../rpc-http";
import type { MarketsEnv } from "../env";
import { tempoReadChain } from "../read-chain";
import type { ReadClient } from "./read-runtime";

function transportFor(e: MarketsEnv): Transport {
  const https = e.rpcHttpUrls.map((url) => tempoHttp(url, { retryCount: 2, timeout: 10_000 }));
  // A socket is only opened where one exists (browsers, Node ≥ 22); SSR renders stay on HTTP.
  const sockets = typeof WebSocket === "undefined" ? [] : e.rpcWsUrls.map((url) => webSocket(url, { keepAlive: { interval: 25_000 }, reconnect: { attempts: 5, delay: 2_000 } }));
  const all = [...sockets, ...https];
  return all.length === 1 ? all[0]! : fallback(all, { rank: false, retryCount: 1 });
}

export function createReadClient(env: MarketsEnv): ReadClient {
  return createPublicClient({ chain: tempoReadChain(env.network), transport: transportFor(env), batch: { multicall: { wait: 8, batchSize: MULTICALL_CHUNK_BYTES } } }) as ReadClient;
}

/**
 * Logs never ride a JSON-RPC batch: Moderato's gateway answers a batch of `eth_getLogs` with 502 (or an HTML body
 * viem can't read), measured 2026-09-29 (S4). One request per log window, on the socket when there is one.
 */
export function createLogClient(env: MarketsEnv): ReadClient {
  const https = env.rpcHttpUrls.map((url) => http(url, { batch: false, retryCount: 2, timeout: 20_000 }));
  const sockets = typeof WebSocket === "undefined" ? [] : env.rpcWsUrls.map((url) => webSocket(url, { keepAlive: { interval: 25_000 }, reconnect: { attempts: 5, delay: 2_000 } }));
  const all = [...sockets, ...https];
  return createPublicClient({ chain: tempoReadChain(env.network), transport: all.length === 1 ? all[0]! : fallback(all, { rank: false, retryCount: 1 }) }) as ReadClient;
}
