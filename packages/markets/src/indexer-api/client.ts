/**
 * The Tempo Indexer API client (plan C.4.3, N-05): read-only SQL over Tempo's indexed blocks/txs/logs/receipts, with
 * any contract event decoded at query time by `signature=` (a CTE named after the event). One interface, three ways in:
 *
 *  - `api-key`     → `https://api.tempo.xyz/v1/indexer` with `tempo-api-key` (owner creates the key; D-086)
 *  - `self-hosted` → our own tidx (`TIDX_URL`, e.g. a tidx following Moderato; same `/query` contract)
 *  - `mpp`         → the Tempo API paid per query through an MPP **session** (the API offers only session; X10)
 *
 * The first two go through `tidx.ts` (`Tidx.create(...).fetch`: retries on 408/429/5xx, typed standard columns);
 * tidx.ts calls the global `fetch`, so the paid route builds the same request and pays through the session manager.
 * Server-only when `mpp` is used (the session holds a key).
 * Docs: tempo docs api/indexer + api/indexer-api; tidx.ts README/source; tidx README "Event Tables".
 */
import { Tidx } from "tidx.ts";
import type { MppSession } from "../mpp/payer";

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
  query: (q: IndexerQuery) => Promise<IndexerResult>;
}

export class IndexerQueryError extends Error {
  override readonly name = "IndexerQueryError";
  constructor(message: string, readonly status: number | null) {
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

export function createIndexerClient(chainId: number, auth: IndexerAuth): IndexerClient {
  if (auth.kind === "mpp") {
    const baseUrl = auth.baseUrl ?? TEMPO_INDEXER_BASE_URL;
    return {
      chainId,
      via: "mpp",
      baseUrl,
      async query(q) {
        const response = await auth.session.fetch(indexerQueryUrl(baseUrl, chainId, q));
        const text = await response.text();
        if (!response.ok) throw new IndexerQueryError(`indexer answered ${response.status}: ${text.slice(0, 300)}`, response.status);
        return { rows: rowsFromRaw(JSON.parse(text)), via: "mpp" };
      },
    };
  }
  const baseUrl = auth.kind === "api-key" ? (auth.baseUrl ?? TEMPO_INDEXER_BASE_URL) : auth.baseUrl;
  const tidx = Tidx.create({
    baseUrl,
    chainId,
    ...(auth.kind === "api-key" ? { headers: { "tempo-api-key": auth.apiKey } } : {}),
    ...(auth.kind === "self-hosted" && auth.basicAuth ? { basicAuth: auth.basicAuth } : {}),
  });
  return {
    chainId,
    via: auth.kind,
    baseUrl,
    async query(q) {
      try {
        const result = await tidx.fetch({ query: q.sql, ...(q.signatures ? { signatures: q.signatures.map((s) => `event ${s.replace(/^event\s+/i, "")}`) as never } : {}), ...(q.engine ? { engine: q.engine } : {}), retryCount: 3 });
        return { rows: result.rows as Record<string, unknown>[], via: auth.kind };
      } catch (error) {
        const status = (error as { status?: number }).status ?? null;
        throw new IndexerQueryError(error instanceof Error ? error.message : String(error), status);
      }
    },
  };
}

/** The indexer's head: the highest block it holds for this chain. */
export async function indexerHead(client: IndexerClient): Promise<bigint> {
  const { rows } = await client.query({ sql: "SELECT max(num) AS head FROM blocks" });
  return BigInt(String(rows[0]?.head ?? 0));
}

/** Whether the indexer holds every block in `[from, to]` (a self-hosted tidx may still be backfilling). */
export async function indexerCovers(client: IndexerClient, fromBlock: bigint, toBlock: bigint): Promise<boolean> {
  const { rows } = await client.query({ sql: `SELECT count(*) AS n FROM blocks WHERE num >= ${fromBlock} AND num <= ${toBlock}` });
  return BigInt(String(rows[0]?.n ?? 0)) === toBlock - fromBlock + 1n;
}
