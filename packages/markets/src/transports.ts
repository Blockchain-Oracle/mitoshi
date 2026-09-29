/**
 * The Tempo transport the wallet layer hands wagmi (plan C.3.1): reads and sends go to the RPC; `eth_fillTransaction`
 * and a sponsored raw send (`feePayer: true`, no fee-payer signature yet) go to our relay first, which co-signs within
 * policy (`withRelay`, viem 2.56 — `withFeePayer` is its deprecated alias; D-055). Lives here because only
 * `@cwf/markets` imports `viem/tempo` (chain-io-boundary).
 */
import { fallback, http, webSocket, type Transport } from "viem";
import { tempoHttp } from "./rpc-http";
import { withRelay } from "viem/tempo";

export function tempoTransport(input: { rpcHttpUrls: readonly string[]; rpcWsUrls?: readonly string[]; relayUrl: string; batch?: boolean }): Transport {
  // Unbatched unless asked: the public RPC refuses JSON-RPC batches over a small weight budget, whole (D-130).
  const https = input.rpcHttpUrls.map((url) => (input.batch ? http(url, { batch: { batchSize: 8 } }) : tempoHttp(url, { retryCount: 3, timeout: 10_000 })));
  const sockets = typeof WebSocket === "undefined" ? [] : (input.rpcWsUrls ?? []).map((url) => webSocket(url));
  const all = [...sockets, ...https];
  const rpc = all.length === 1 ? all[0]! : fallback(all);
  return withRelay(rpc, http(input.relayUrl));
}
