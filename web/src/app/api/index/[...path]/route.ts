// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:web/src/app/api/index/[...path]/route.ts
import { NETWORKS, networkFrom } from "@cwf/core";
import { indexReader, type IndexReader } from "@cwf/db/idx";
import { NextResponse, type NextRequest } from "next/server";
import { BadRequest, NotDeployed, resolveIndexQuery } from "@/lib/index-queries";
import { db } from "@/server/db";
import { MissingConfigError } from "@/server/env";

/**
 * The indexer's read API (plan C.4.5): Windows with prints, wallet fills, positions, actions and claims, tape, print
 * history, candles, proof rows, the print archive and freshness — straight from the ops indexer's Postgres. Never gates
 * a write. Public answers ride a 2 s shared cache; wallet answers are never cached. Per-request and on the Node
 * runtime by default under `cacheComponents` (which refuses the `runtime`/`dynamic` segment configs): the handler
 * reads the request.
 */

const PUBLIC_CACHE = "public, s-maxage=2, stale-while-revalidate=8";
const PRIVATE_CACHE = "private, no-store";

let reader: IndexReader | null = null;

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  let sql;
  try {
    sql = db();
  } catch (error) {
    if (error instanceof MissingConfigError) return NextResponse.json({ error: "indexer not configured" }, { status: 503, headers: { "cache-control": PRIVATE_CACHE } });
    throw error;
  }
  reader ??= indexReader(sql);
  const { path } = await context.params;
  const query = Object.fromEntries(request.nextUrl.searchParams);
  let resolved;
  try {
    resolved = resolveIndexQuery(path, query, NETWORKS[networkFrom(process.env.NETWORK)]);
  } catch (error) {
    if (error instanceof BadRequest) return NextResponse.json({ error: error.message }, { status: 400, headers: { "cache-control": PRIVATE_CACHE } });
    if (error instanceof NotDeployed) return NextResponse.json({ error: "not-deployed", reason: error.message }, { status: 404, headers: { "cache-control": PUBLIC_CACHE } });
    throw error;
  }
  if (!resolved) return NextResponse.json({ error: `no index path /${path.join("/")}` }, { status: 404, headers: { "cache-control": PUBLIC_CACHE } });
  try {
    const rows = await resolved.run(reader, sql);
    const cache = resolved.scope === "wallet" ? PRIVATE_CACHE : (resolved.cacheControl ?? PUBLIC_CACHE);
    return NextResponse.json({ rows }, { headers: { "cache-control": cache } });
  } catch {
    // The connection or the query failed: an outage the provider reads as `indexer-down` and retries.
    return NextResponse.json({ error: "indexer query failed" }, { status: 503, headers: { "cache-control": PRIVATE_CACHE } });
  }
}
