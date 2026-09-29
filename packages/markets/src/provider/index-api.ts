/**
 * Our index read API (`/api/index/*`, plan C.4.5) — discovery only: which Windows are live, which Windows a wallet
 * touched, its fills. Every figure that gates a write or shows money is then re-read head-fresh from the lens; the
 * index never gates a write (canon #1). When the index is unreachable (not configured, an outage, a relative URL in a
 * script) the callers fall back to the chain itself — the lens's Series listing and the engine's own logs — so a
 * reading stays real rather than empty.
 */
import type { Address, Hex } from "viem";
import { toMarketId, type MarketId } from "@cwf/core";
import { marketsEnv } from "../runtime/read-runtime";

export class IndexUnavailableError extends Error {
  constructor(reason: string) {
    super(`index unavailable: ${reason}`);
    this.name = "IndexUnavailableError";
  }
}

type Row = Record<string, unknown>;

/** The base URL, absolute; a relative base only resolves in a browser (same origin). */
function base(): string {
  const url = marketsEnv().indexUrl;
  if (/^https?:\/\//.test(url)) return url.replace(/\/$/, "");
  const origin = (globalThis as { location?: { origin: string } }).location?.origin;
  if (origin) return `${origin}${url.replace(/\/$/, "")}`;
  throw new IndexUnavailableError(`relative index URL ${url} outside a browser`);
}

export async function indexGet(path: string, query: Record<string, string | number | undefined> = {}, fetcher: typeof fetch = fetch): Promise<Row[]> {
  const params = new URLSearchParams(Object.entries(query).flatMap(([k, v]): [string, string][] => (v === undefined ? [] : [[k, String(v)]])));
  const url = `${base()}/${path}${params.size ? `?${params}` : ""}`;
  let res: Response;
  try {
    res = await fetcher(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new IndexUnavailableError(error instanceof Error ? error.message : String(error));
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new IndexUnavailableError(`${res.status} on /${path}`);
  const body = (await res.json()) as { rows?: Row[] };
  if (!Array.isArray(body.rows)) throw new IndexUnavailableError(`no rows on /${path}`);
  return body.rows;
}

const idOf = (r: Row): MarketId => toMarketId(String(r.market));

/** Open Windows whose lock is still ahead (`/markets?live=now`). */
export async function indexLiveIds(nowSec: number, limit = 500): Promise<MarketId[]> {
  return (await indexGet("markets", { live: nowSec, limit })).map(idOf);
}

/** Recently settled Windows, newest first. */
export async function indexSettledIds(limit: number): Promise<MarketId[]> {
  return (await indexGet("markets", { settled: 1, limit })).map(idOf);
}

/** Windows of one Series, newest expiry first (next-Window lookups). */
export async function indexSeriesIds(seriesId: Hex, limit = 3): Promise<MarketId[]> {
  return (await indexGet("markets", { series: seriesId.toLowerCase(), limit })).map(idOf);
}

/** Windows where the wallet holds (or held) a position; `unredeemed` narrows to those not yet paid out. */
export async function indexWalletMarkets(wallet: Address, unredeemed: boolean): Promise<MarketId[]> {
  return (await indexGet(`wallet/${wallet.toLowerCase()}/positions`, { unredeemed: unredeemed ? 1 : undefined, limit: 1000 })).map(idOf);
}

export interface IndexedFill {
  marketId: MarketId;
  txHash: Hex;
  logIndex: number;
  tsSec: number;
  taker: Address;
  takerKind: number;
  maker: Address;
  makerKind: number;
  priceTicks: number;
  lots: bigint;
}

export function toIndexedFill(r: Row): IndexedFill {
  return {
    marketId: idOf(r), txHash: r.tx_hash as Hex, logIndex: Number(r.log_index), tsSec: Number(r.ts_sec), taker: r.taker as Address, takerKind: Number(r.taker_kind),
    maker: r.maker as Address, makerKind: Number(r.maker_kind), priceTicks: Number(r.price_ticks), lots: BigInt(String(r.lots)),
  };
}

/** Every fill of the wallet (either side), paged to `maxPages × 1000`; `complete` false past the cap. */
export async function indexWalletFills(wallet: Address, maxPages = 5): Promise<{ fills: IndexedFill[]; complete: boolean }> {
  const fills: IndexedFill[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await indexGet(`wallet/${wallet.toLowerCase()}/fills`, { limit: 1000, offset: page * 1000 });
    fills.push(...rows.map(toIndexedFill));
    if (rows.length < 1000) return { fills, complete: true };
  }
  return { fills, complete: false };
}
