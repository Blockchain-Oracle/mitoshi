import "server-only";
/**
 * What the hero phone shows first (R6 landing L01): the hero's Window and its pays, read from the chain with the ops
 * client (`@cwf/markets/ops`, the agents preview's reads — no index needed, so it reads the same everywhere), and the
 * last ten minutes of its asset's line from ops `/prices/recent`. Each is cached so traffic never multiplies the reads
 * (the series list five minutes, the Window and its book ten seconds, the points five), and each is raced against
 * `withinBudget` by the page: the hero renders whatever arrived in time and the island fetches the rest.
 */
import { CHAIN } from "@cwf/clients";
import { noEntryCutoffSec } from "@cwf/core";
import { createOpsClient, listSeries, readBooks, runnerVenueOf, tradingWindowsOf } from "@cwf/markets/ops";
import { cacheLife } from "next/cache";
import { webEnv } from "@/lib/env";
import { serverEnv } from "@/server/env";
import type { HeroWire } from "./hero-model";
import { HERO_SYMBOLS, paysOf, pickHeroWindow, quoted, type HeroCandidate, type HeroPays } from "./hero-window";
import { thin } from "./sparkline";


const NO_PAYS: HeroPays = { upTicks: null, downTicks: null };
const LINE_SPAN_MS = 10 * 60_000;
const FIRST_PAINT_POINTS = 120;

function opsClient() {
  const env = serverEnv();
  const venue = runnerVenueOf(env.network === "mainnet" ? CHAIN.tempo : CHAIN.moderato);
  return venue ? { venue, client: createOpsClient({ network: env.network, rpcUrl: env.rpcHttpUrl, tier: 2 }) } : null;
}

/** The candidates' 24/7 crypto series (they change only when a lane is added). */
async function heroSeries(): Promise<{ id: `0x${string}`; symbol: string }[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3_600 });
  const ops = opsClient();
  if (!ops) return [];
  const wanted = new Set<string>(HERO_SYMBOLS);
  return (await listSeries(ops.client, ops.venue)).filter((s) => s.lane === "crypto24" && s.symbol !== null && wanted.has(s.symbol)).map((s) => ({ id: s.seriesId, symbol: s.symbol! }));
}

/** The hero's Window and the book's pays on it; ten seconds old at most. */
export async function heroWindow(): Promise<{ window: HeroCandidate | null; pays: HeroPays }> {
  "use cache";
  cacheLife({ stale: 5, revalidate: 10, expire: 60 });
  const ops = opsClient();
  if (!ops) return { window: null, pays: NO_PAYS };
  const series = await heroSeries();
  const symbolOf = new Map(series.map((s) => [s.id.toLowerCase(), s.symbol]));
  const nowSec = Math.floor(Date.now() / 1000);
  const windows = await tradingWindowsOf(ops.client, ops.venue, series.map((s) => s.id), nowSec);
  const candidates: HeroCandidate[] = windows.flatMap((w) => {
    const symbol = symbolOf.get(w.seriesId.toLowerCase());
    return symbol
      ? [{ symbol, marketId: w.marketId, cadenceSec: w.cadenceSec, tradingStartSec: w.tradingStartSec, expirySec: w.expirySec, cutoffSec: noEntryCutoffSec({ lockAtSec: w.lockAtSec, intervalSec: w.cadenceSec }), openPriceE8: w.openPriceE8.toString() }]
      : [];
  });
  const books = await readBooks(ops.client, ops.venue, candidates.map((c) => c.marketId as `0x${string}`));
  const pays = new Map(candidates.map((c) => [c.marketId.toLowerCase(), paysOf(books.get(c.marketId.toLowerCase()) ?? null)]));
  const window = pickHeroWindow(candidates, nowSec, (id) => quoted(pays.get(id.toLowerCase()) ?? NO_PAYS));
  return { window, pays: window ? (pays.get(window.marketId.toLowerCase()) ?? NO_PAYS) : NO_PAYS };
}

/** The asset's last ten minutes from ops, thinned; empty when ops doesn't answer. */
export async function heroPoints(symbol: string): Promise<[number, string][]> {
  "use cache";
  cacheLife({ stale: 5, revalidate: 5, expire: 30 });
  const base = webEnv.markets.opsUrl?.replace(/\/+$/, "");
  if (!base) return [];
  const res = await fetch(`${base}/prices/recent?symbol=${encodeURIComponent(symbol)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(2_500) });
  if (!res.ok) return [];
  const body = (await res.json()) as { points?: [number, string][] };
  const points = (body.points ?? []).filter(([t, p]) => Number.isFinite(t) && /^\d{1,30}$/.test(p));
  const from = (points.at(-1)?.[0] ?? 0) - LINE_SPAN_MS;
  return thin(points.filter(([t]) => t >= from), FIRST_PAINT_POINTS);
}

/** Everything the hero needs, each part independent: a part that fails reads as missing, never as a made-up value. */
export async function heroData(): Promise<HeroWire> {
  const picked = await heroWindow().catch(() => ({ window: null, pays: NO_PAYS }));
  const symbol = picked.window?.symbol ?? HERO_SYMBOLS[0];
  const points = await heroPoints(symbol).catch(() => [] as [number, string][]);
  return { ...picked, points, symbol, readAtMs: Date.now() };
}
