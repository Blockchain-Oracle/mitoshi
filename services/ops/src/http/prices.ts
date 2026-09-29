// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/http/spot-sse.ts (`/prices/latest`; the SSE moved to `/v1/stream`).
/**
 * `GET /prices/latest` and `GET /prices/history?symbol=&from=&to=` (C.5.1). Row shape `{ priceE8, publishTimeSec,
 * source, signers, ageSec, fresh }`. A symbol is never dropped: an aged quote stays with `fresh: false`, and a symbol
 * the in-memory feed has nothing on (a restart) is served from the newest `print_archive` boundary as `source: "archive"`.
 */
import { decimalToE8, redstoneMedianE8 } from "@cwf/markets/ops";
import type { Sql } from "@cwf/db";
import { spotFeeds, type SpotFeed, type SpotQuote, type SpotSymbol } from "../prices/spot";

export const FRESH_MAX_AGE_SEC = 60;

export interface WireQuote {
  priceE8: string;
  publishTimeSec: number;
  source: SpotQuote["source"] | "archive";
  signers: number;
  ageSec: number;
  fresh: boolean;
}

const wire = (priceE8: bigint, publishTimeSec: number, source: WireQuote["source"], signers: number, nowSec: number): WireQuote => {
  const ageSec = Math.max(0, nowSec - publishTimeSec);
  return { priceE8: priceE8.toString(), publishTimeSec, source, signers, ageSec, fresh: ageSec <= FRESH_MAX_AGE_SEC };
};

type ArchivePkg = { signerAddress: string; dataPoints?: { value?: number | string }[] };

/** The newest archived boundary's median per missing symbol. */
async function archiveLatest(sql: Sql, missing: Array<{ symbol: SpotSymbol; feed: string }>, signers: ReadonlySet<string>): Promise<Map<SpotSymbol, { priceE8: bigint; tSec: number; signers: number }>> {
  const out = new Map<SpotSymbol, { priceE8: bigint; tSec: number; signers: number }>();
  const [row] = await sql<{ t_sec: string; feeds: Record<string, ArchivePkg[]> }[]>`select t_sec::text, feeds from print_archive where source = 'redstone' order by t_sec desc limit 1`;
  if (!row) return out;
  for (const { symbol, feed } of missing) {
    const pkgs = (row.feeds[feed] ?? []).filter((p) => signers.has(p.signerAddress.toLowerCase()) && p.dataPoints?.[0]?.value !== undefined);
    if (pkgs.length === 0) continue;
    out.set(symbol, { priceE8: redstoneMedianE8(pkgs.map((p) => decimalToE8(String(p.dataPoints![0]!.value)))), tSec: Number(row.t_sec), signers: pkgs.length });
  }
  return out;
}

export async function latestBody(spot: SpotFeed | null, sql: Sql | null, signers: ReadonlySet<string>, nowSec = Math.floor(Date.now() / 1000)): Promise<Record<string, WireQuote>> {
  const out: Record<string, WireQuote> = {};
  const missing: Array<{ symbol: SpotSymbol; feed: string }> = [];
  for (const f of spotFeeds()) {
    const q = spot?.newest(f.symbol);
    if (q) out[f.symbol] = wire(q.priceE8, q.publishTimeSec, q.source, q.signers, nowSec);
    else missing.push(f);
  }
  if (missing.length && sql) {
    const archived = await archiveLatest(sql, missing, signers).catch(() => new Map());
    for (const [symbol, a] of archived) out[symbol] = wire(a.priceE8, a.tSec, "archive", a.signers, nowSec);
  }
  return out;
}

export async function historyBody(sql: Sql, symbol: string, fromSec: number, toSec: number): Promise<Array<{ t: number; priceE8: string }>> {
  const rows = await sql<{ t: string; price_e8: string }[]>`
    select publish_sec::text as t, price_e8::text from price_ticks where symbol = ${symbol} and publish_sec between ${fromSec} and ${toSec}
    order by publish_sec limit 5000`;
  return rows.map((r) => ({ t: Number(r.t), priceE8: r.price_e8 }));
}
