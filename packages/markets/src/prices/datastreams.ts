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

/**
 * The streams a same-call price proof may name, per venue symbol (context/tempo/15 §2 table, from Chainlink's RDD
 * `feeds-ethereum-mainnet-arbitrum-1.json`, `contractType: "verifier"`): equities on their RegularHours v11 stream,
 * crypto on its v3 stream. A symbol missing here has no stream the venue accepts.
 */
export const DATA_STREAMS_FEEDS: Readonly<Record<string, Hex>> = {
  TSLA: "0x000b2dbed1640ead18d37338b75e4755630a900649261baf4ed79d9a749be13d",
  NVDA: "0x000b6aa036224454037bab103184565f6aa9ea589c3b349f6d8471ee753524b9",
  AAPL: "0x000bbd87a23775b4c11092ae9a1fc7b3393636ae1dbb9f1ef460f845c0f4cff1",
  MSFT: "0x000bc4bcae3f338a2496aeee763156b999465bda826a3ccc94987d32a98212ab",
  META: "0x000bc63e601958daafb805b1eecc3972a0ad231e8c08c0432961b7b5c3251166",
  GOOGL: "0x000b1a2aa24db17599e5003a09bcd5e2a15ef66f79c2dca4dde108ab923b1e97",
  AMZN: "0x000bfb41659084e9ea0ea672b12b7878d88511dcac813d82435da65df946f65c",
  PLTR: "0x000b0a2a7bd663521a7e191c71c9e120825c0419445ac614fb9dcd3eafeb6298",
  AMD: "0x000b122bc7189267b8c0f0759c71895809633b1aaa0c71ffb31f81ddb5d56849",
  SPCX: "0x000b4f3c6cbfd4f0ba9c635b5dd3b188338c98a3f6b595615ddfdb3a75dee647",
  BTC: "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8",
  ETH: "0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9",
  SOL: "0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f",
};

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
