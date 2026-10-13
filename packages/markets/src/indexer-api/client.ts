/**
 * The Tempo Indexer API client (plan C.4.3, N-05): read-only SQL over Tempo's indexed blocks/txs/logs/receipts, with
 * any contract event decoded at query time by `signature=` (a CTE named after the event). One interface, three ways in:
 *
 *  - `api-key`     → `https://api.tempo.xyz/v1/indexer` with `tempo-api-key` (owner creates the key; D-086)
 *  - `self-hosted` → our own tidx (`TIDX_URL`, e.g. a tidx following Moderato; same `/query` contract)
 *  - `mpp`         → the Tempo API paid per query through an MPP **session** (the API offers only session; X10)
 *
 * The first two go through `tidx.ts` (`Tidx.create(...).fetch`, typed standard columns) with its own retries off: the
 * pacer (`./pacer`, R6) owns retries, because tidx.ts retries a 429 after 200 ms whatever `Retry-After` says. Every
 * answer's `RateLimit-*` headers reach the pacer. tidx.ts calls the global `fetch`, so the paid route builds the same
 * request and pays through the session manager. Server-only when `mpp` is used (the session holds a key).
 * Docs: tempo docs api/indexer + api/indexer-api + api/rate-limits; tidx.ts README/source; tidx README "Event Tables".
 */
import { Tidx } from "tidx.ts";
import type { MppSession } from "../mpp/payer";
import { rateLimitFromHeaders, retryAfterMsFrom, type IndexerPacer, type RateLimitInfo } from "./pacer";

export const TEMPO_INDEXER_BASE_URL = "https://api.tempo.xyz/v1/indexer";

export type IndexerAuth =
  | { kind: "api-key"; apiKey: string; baseUrl?: string }
  | { kind: "self-hosted"; baseUrl: string; basicAuth?: string }
  | { kind: "mpp"; session: Pick<MppSession, "fetch">; baseUrl?: string };

export interface IndexerQuery {
  sql: string;
  /** Event signatures with parameter names, e.g. `Transfer(address indexed from, address indexed to, uint256 value)`. */
  signatures?: readonly string[];
  engine?: "postgres" | "clickhouse";
}

export interface IndexerResult {
  rows: Record<string, unknown>[];
  via: IndexerAuth["kind"];
}

export interface IndexerClient {
  chainId: number;
  via: IndexerAuth["kind"];
  baseUrl: string;
  /**
   * The engine that holds full history: the hosted API's ClickHouse archive (its PostgreSQL keeps a hot window only,
   * tidx README "Tiered Storage"); unset for a self-hosted tidx, whose operator decides. One store for every query of
   * a recount, so coverage and counts never come from two tiers.
   */
  archiveEngine?: "clickhouse";
  /** Set when queries are paced under the key's rate limit (`./pacer`); its stats go to `/health`. */
  pacer?: IndexerPacer;
  query: (q: IndexerQuery) => Promise<IndexerResult>;
}

export class IndexerQueryError extends Error {
  override readonly name = "IndexerQueryError";
  constructor(
    message: string,
    readonly status: number | null,
    /** From `Retry-After` on a 429. */
    readonly retryAfterMs: number | null = null,
    readonly rate: RateLimitInfo | null = null,
  ) {
    super(message);
  }
}

/** The exact URL the Tempo API / tidx expects (`/query?sql=…&chainId=…&signature=…`). */
export function indexerQueryUrl(baseUrl: string, chainId: number, q: IndexerQuery): URL {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/query`);
  url.searchParams.set("sql", q.sql);
  url.searchParams.set("chainId", String(chainId));
  if (q.engine) url.searchParams.set("engine", q.engine);
  for (const sig of q.signatures ?? []) url.searchParams.append("signature", sig.replace(/^(event|function)\s+/i, ""));
  return url;
}

/** `{ ok, columns, rows[][] }` → row objects; an `ok: false` body is an error with the indexer's own message. */
export function rowsFromRaw(raw: unknown): Record<string, unknown>[] {
  const body = raw as { ok?: boolean; columns?: string[]; rows?: unknown[][]; error?: string };
  if (!body || body.ok !== true || !Array.isArray(body.columns) || !Array.isArray(body.rows)) {
    throw new IndexerQueryError(body?.error ?? "malformed indexer response", null);
  }
  return body.rows.map((row) => Object.fromEntries(body.columns!.map((c, i) => [c, row[i]])));
}

export interface IndexerClientOptions {
  /** Pace every query under the key's rate limit (`./pacer`); unpaced when absent. */
  pacer?: IndexerPacer;
}

export function createIndexerClient(chainId: number, auth: IndexerAuth, options: IndexerClientOptions = {}): IndexerClient {
  const pacer = options.pacer;
  const paced = (raw: (q: IndexerQuery) => Promise<IndexerResult>) => (pacer ? (q: IndexerQuery) => pacer.run(() => raw(q)) : raw);
  const observe = (headers: Headers) => pacer?.observe(rateLimitFromHeaders(headers));
  const failure = (message: string, response: Response) =>
    new IndexerQueryError(message, response.status, response.status === 429 ? retryAfterMsFrom(response.headers, Date.now()) : null, rateLimitFromHeaders(response.headers));

  if (auth.kind === "mpp") {
    const baseUrl = auth.baseUrl ?? TEMPO_INDEXER_BASE_URL;
    return {
      chainId,
      via: "mpp",
      baseUrl,
      archiveEngine: "clickhouse",
      ...(pacer ? { pacer } : {}),
      query: paced(async (q) => {
        const response = await auth.session.fetch(indexerQueryUrl(baseUrl, chainId, q));
        observe(response.headers);
        const text = await response.text();
        if (!response.ok) throw failure(`indexer answered ${response.status}: ${text.slice(0, 300)}`, response);
        return { rows: rowsFromRaw(JSON.parse(text)), via: "mpp" };
      }),
    };
  }
  const baseUrl = auth.kind === "api-key" ? (auth.baseUrl ?? TEMPO_INDEXER_BASE_URL) : auth.baseUrl;
  const tidx = Tidx.create({
    baseUrl,
    chainId,
    ...(auth.kind === "api-key" ? { headers: { "tempo-api-key": auth.apiKey } } : {}),
    ...(auth.kind === "self-hosted" && auth.basicAuth ? { basicAuth: auth.basicAuth } : {}),
  });
  // Every answer, success or error, carries the quota headers; tidx.ts hands each response to its listeners.
  if (pacer) tidx.on("response", (response) => observe(response.headers));
  return {
    chainId,
    via: auth.kind,
    baseUrl,
    ...(auth.kind === "api-key" ? { archiveEngine: "clickhouse" as const } : {}),
    ...(pacer ? { pacer } : {}),
    query: paced(async (q) => {
      try {
        const result = await tidx.fetch({ query: q.sql, ...(q.signatures ? { signatures: q.signatures.map((s) => `event ${s.replace(/^event\s+/i, "")}`) as never } : {}), ...(q.engine ? { engine: q.engine } : {}), retryCount: pacer ? 1 : 3 });
        return { rows: result.rows as Record<string, unknown>[], via: auth.kind };
      } catch (error) {
        const response = (error as { response?: Response }).response;
        if (response instanceof Response) throw failure(error instanceof Error ? error.message : String(error), response);
        throw new IndexerQueryError(error instanceof Error ? error.message : String(error), (error as { status?: number }).status ?? null);
      }
    }),
  };
}

/** The indexer's head: the highest block it holds for this chain. */
export async function indexerHead(client: IndexerClient): Promise<bigint> {
  const { rows } = await client.query({ sql: "SELECT max(num) AS head FROM blocks", ...(client.archiveEngine ? { engine: client.archiveEngine } : {}) });
  return BigInt(String(rows[0]?.head ?? 0));
}
