/**
 * Chainlink Data Streams REST (plan C.5.2 price-relay "Data Streams on mainnet"; context/tempo/15 §2, rows 4 and 9):
 * the report covering boundary T (`/api/v1/reports?feedID&timestamp`, windows contiguous with no gaps, so exactly one
 * report covers any T) and the latest report. The `fullReport` bytes are the `DataStreamsPrintVerifier` proof as is
 * (the verifier calls the proxy's `verify`). Server-only: HMAC-SHA256 over `METHOD FULL_PATH BODY_HASH API_KEY
 * TIMESTAMP` joined by single spaces, per docs.chain.link/data-streams/reference/data-streams-api/authentication.
 * The key and secret never appear in a URL or a log line. Testnet has no credentials yet (Q-011): callers get
 * `null` from `dataStreamsEnv` and the relay reports the source as unavailable, never a mock.
 */
import { createHash, createHmac } from "node:crypto";
import type { Hex } from "viem";

export const DATA_STREAMS_HOSTS = { mainnet: "https://api.dataengine.chain.link", testnet: "https://api.testnet-dataengine.chain.link" } as const;

export interface DataStreamsEnv {
  host: string;
  apiKey: string;
  apiSecret: string;
}

export interface DataStreamsReport {
  feedId: Hex;
  validFromSec: number;
  observationsSec: number;
  fullReport: Hex;
}

/** Credentials from `DATASTREAMS_API_KEY` / `DATASTREAMS_API_SECRET`; null when either is missing. */
export function dataStreamsEnv(network: "mainnet" | "testnet", env: NodeJS.ProcessEnv = process.env): DataStreamsEnv | null {
  const apiKey = env.DATASTREAMS_API_KEY?.trim();
  const apiSecret = env.DATASTREAMS_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { host: env.DATASTREAMS_API_URL?.trim() || DATA_STREAMS_HOSTS[network], apiKey, apiSecret };
}

/** The three auth headers for `method fullPath` at `timestampMs` (exported so a test can pin the string to sign). */
export function dataStreamsAuthHeaders(method: string, fullPath: string, apiKey: string, apiSecret: string, timestampMs: number, body = ""): Record<string, string> {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", apiSecret).update(`${method.toUpperCase()} ${fullPath} ${bodyHash} ${apiKey} ${timestampMs}`).digest("hex");
  return { Authorization: apiKey, "X-Authorization-Timestamp": String(timestampMs), "X-Authorization-Signature-SHA256": signature };
}

type Wire = { report?: { feedID?: string; validFromTimestamp?: number; observationsTimestamp?: number; fullReport?: string } };

function parse(body: Wire): DataStreamsReport | null {
  const r = body.report;
  if (!r?.feedID || !r.fullReport || typeof r.observationsTimestamp !== "number") return null;
  return { feedId: r.feedID as Hex, validFromSec: Number(r.validFromTimestamp ?? r.observationsTimestamp), observationsSec: r.observationsTimestamp, fullReport: r.fullReport as Hex };
}

async function get(ds: DataStreamsEnv, fullPath: string, fetchImpl: typeof fetch): Promise<{ status: number; report: DataStreamsReport | null }> {
  const res = await fetchImpl(`${ds.host}${fullPath}`, { headers: dataStreamsAuthHeaders("GET", fullPath, ds.apiKey, ds.apiSecret, Date.now()), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return { status: res.status, report: null };
  return { status: res.status, report: parse((await res.json()) as Wire) };
}

/** The report whose window `[validFrom, observations]` contains T. */
export function fetchReportAt(ds: DataStreamsEnv, feedId: Hex, tSec: number, fetchImpl: typeof fetch = fetch) {
  return get(ds, `/api/v1/reports?feedID=${feedId}&timestamp=${tSec}`, fetchImpl);
}

export function fetchLatestReport(ds: DataStreamsEnv, feedId: Hex, fetchImpl: typeof fetch = fetch) {
  return get(ds, `/api/v1/reports/latest?feedID=${feedId}`, fetchImpl);
}

/**
 * The v11 report's `marketStatus` (0 Unknown, 2 Open/Regular, 5 Closed; 24/5 streams 1 Pre, 3 Post, 4 Overnight) and
 * mid price, read from the report blob without verifying (halt-watch display only; the verifier is what proves).
 * Layout: `fullReport = abi.encode(bytes32[3] context, bytes reportBlob, bytes32[] rs, bytes32[] ss, bytes32 rawVs)`;
 * v11 blob = `feedId, validFrom, observations, nativeFee, linkFee, expiresAt, mid, lastSeenTimestampNs, bid, bidVolume,
 * ask, askVolume, lastTradedPrice, marketStatus` (docs report-schema v11).
 */
export function v11Summary(fullReport: Hex): { midE18: bigint; marketStatus: number; observationsSec: number } | null {
  const hex = fullReport.slice(2);
  const word = (buf: string, i: number) => BigInt(`0x${buf.slice(i * 64, i * 64 + 64)}`);
  if (hex.length < 64 * 5) return null;
  const blobOffset = Number(word(hex, 3)) * 2;
  const blobLen = Number(BigInt(`0x${hex.slice(blobOffset, blobOffset + 64)}`)) * 2;
  const blob = hex.slice(blobOffset + 64, blobOffset + 64 + blobLen);
  if (blob.length < 64 * 14) return null;
  const signed = (v: bigint) => (v >= 2n ** 191n ? v - 2n ** 192n : v);
  return { midE18: signed(word(blob, 6) & (2n ** 192n - 1n)), marketStatus: Number(word(blob, 13)), observationsSec: Number(word(blob, 2)) };
}
