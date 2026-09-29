/**
 * HTTP transport to a Tempo RPC, shaped to the public endpoint's limits (D-130). Measured on `rpc.moderato.tempo.xyz`
 * (2026-09-29): a JSON-RPC batch is budgeted by method weight — 8 `eth_call`s pass, 9 answer HTTP 413 `request too
 * large`; 24 `eth_blockNumber`s pass, 25 do not — and a rate-limited batch answers HTTP 429 with a single error object.
 * Either way viem's batch scheduler gets an object where it expects an array and throws `Cannot read properties of
 * undefined (reading 'error')` for every request in the batch. The scheduler is process-wide per URL, so in ops every
 * actor's reads inside the batch wait landed in one batch, and a boundary's load failed opens, prints and quotes
 * together.
 *
 * So requests go one per HTTP request (keep-alive; no JSON-RPC batching), a rate limit comes back per request as HTTP
 * 429 / -32005 which viem retries with backoff, and Multicall3 chunks are larger so a pass sends fewer `eth_call`s.
 */
import { http, type HttpTransport } from "viem";

/** Calldata bytes per Multicall3 chunk (viem's default is 1,024: `marketOf` is 36 bytes, so ≈ 28 reads per chunk). */
export const MULTICALL_CHUNK_BYTES = 8_192;

export interface TempoHttpOptions {
  retryCount?: number;
  timeout?: number;
  /** Tests: the fetch the transport sends through. */
  fetchFn?: typeof fetch;
}

/** One request per HTTP request; viem retries 429 / -32005 / 5xx with exponential backoff from 150 ms. */
export function tempoHttp(url: string | undefined, options: TempoHttpOptions = {}): HttpTransport {
  return http(url, { batch: false, retryCount: options.retryCount ?? 5, timeout: options.timeout ?? 30_000, ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}) });
}
