/**
 * Spot prices from ops (plan C.2.2 `getAssetPrice` / `getPriceHistory`; D-049): `GET <ops>/prices/latest` (RedStone
 * signed quotes, `-24` keys for the 24/7 feeds) and `/prices/history`. The live ticks arrive on the SSE stream
 * (`stream/`), written into the same query keys. RedStone publishes no EMA, so `emaRaw` carries the quote itself —
 * nothing on screen may read it as a smoothed series. Replaces Masayume 68f7a09:packages/markets/src/provider/prices.ts
 * (Pyth pull).
 */
import type { AssetPrice, PricePoint } from "@cwf/core";
import { marketsEnv } from "../runtime/read-runtime";

export const PRICE_DECIMALS = 8;

export class OpsUnavailableError extends Error {
  constructor(reason: string) {
    super(`ops unavailable: ${reason}`);
    this.name = "OpsUnavailableError";
  }
}

async function opsGet<T>(path: string, fetcher: typeof fetch): Promise<T> {
  const base = marketsEnv().opsUrl;
  if (!base) throw new OpsUnavailableError("no ops URL configured");
  const res = await fetcher(`${base.replace(/\/$/, "")}${path}`, { headers: { accept: "application/json" } }).catch((e: unknown) => {
    throw new OpsUnavailableError(e instanceof Error ? e.message : String(e));
  });
  if (!res.ok) throw new OpsUnavailableError(`${res.status} on ${path}`);
  return (await res.json()) as T;
}

interface WireQuote {
  priceE8: string;
  publishTimeSec: number;
  fresh: boolean;
}

/** The ops key for an asset on a lane: `TSLA` (session) or `TSLA-24` (the 24/7 feed). */
export const priceKey = (asset: string, allHours = false) => (allHours && !["BTC", "ETH", "SOL"].includes(asset) ? `${asset}-24` : asset);

export function toAssetPrice(asset: string, q: WireQuote): AssetPrice {
  const priceRaw = BigInt(q.priceE8);
  return { asset, priceRaw, emaRaw: priceRaw, decimals: PRICE_DECIMALS, blockTimestampSec: q.publishTimeSec };
}

/** The newest quote; null when ops lists nothing for the key (a symbol with no signed source). */
export async function fetchAssetPrice(key: string, fetcher: typeof fetch = fetch): Promise<AssetPrice | null> {
  const all = await opsGet<Record<string, WireQuote>>("/prices/latest", fetcher);
  const q = all[key];
  return q ? toAssetPrice(key, q) : null;
}

export async function fetchPriceHistory(key: string, fromSec: number, toSec: number, fetcher: typeof fetch = fetch): Promise<PricePoint[]> {
  const body = await opsGet<{ rows: { t: number; priceE8: string }[] }>(`/prices/history?symbol=${encodeURIComponent(key)}&from=${fromSec}&to=${toSec}`, fetcher);
  return body.rows.map((r) => ({ priceRaw: BigInt(r.priceE8), emaRaw: BigInt(r.priceE8), blockTimestampSec: r.t }));
}
