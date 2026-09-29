/**
 * Live Windows on the S3 venue that a drive can trade (S4): every Series' latest listed indices, read through the lens,
 * narrowed to Windows that are Trading now, have their opening print recorded (E-19), and show a book. Read-only.
 */
import type { Address, Hex } from "viem";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { createOpsClient, fetchMarkets, listSeries, marketIdOf, topOfBook, venueOf, type MarketView, type OpsClient, type SeriesView, type TopView, type Venue } from "@cwf/markets/ops";

export interface LiveWindow {
  series: SeriesView;
  market: MarketView;
  top: TopView;
}

export function testnetVenue(): { client: OpsClient; venue: Venue } {
  const client = createOpsClient({ network: "testnet", rpcUrl: process.env.TEMPO_RPC_HTTP_URL });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error("engine not deployed on Moderato");
  return { client, venue };
}

/** Trading Windows with an open print, soonest-locking last (most time left first), with their top of book. */
export async function liveWindows(client: OpsClient, venue: Venue, nowSec: number, lookback = 3): Promise<LiveWindow[]> {
  const series = await listSeries(client, venue);
  const ids: { s: SeriesView; id: Hex }[] = [];
  for (const s of series) for (let k = 1n; k <= BigInt(lookback) && s.nextIndex - k >= 0n; k++) ids.push({ s, id: marketIdOf(s.seriesId, s.nextIndex - k) });
  const markets = await fetchMarkets(client, venue, ids.map((x) => x.id));
  const trading = ids.flatMap((x, i) => {
    const m = markets[i];
    return m && m.state === 0 && m.tradingStartSec <= nowSec && nowSec < m.lockAtSec && m.prints.open.source !== 0 ? [{ series: x.s, market: m }] : [];
  });
  const tops = await Promise.all(trading.map((w) => topOfBook(client, venue, w.market.marketId)));
  return trading.map((w, i) => ({ ...w, top: tops[i]! })).sort((a, b) => b.market.lockAtSec - a.market.lockAtSec);
}

export const label = (w: LiveWindow) => `${w.series.symbol}/${w.series.lane}/${w.series.cadenceSec / 60}m#${w.market.index}`;
export type { Address };

/** Top of book including orders still inside their rest period (a new PostOnly must not cross them either). */
export async function rawTop(client: OpsClient, venue: Venue, marketId: Hex): Promise<TopView> {
  const lens = { address: venue.lens, abi: engineLensAbi } as const;
  const [bids, asks] = (await Promise.all([true, false].map((isBid) => client.public.readContract({ ...lens, functionName: "levels", args: [marketId, isBid, 1n, 0, 512n] })))) as unknown as [readonly [readonly number[], readonly bigint[]], readonly [readonly number[], readonly bigint[]]];
  return { bidTicks: Number(bids[0][0] ?? 0), bidLots: bids[1][0] ?? 0n, askTicks: Number(asks[0][0] ?? 0), askLots: asks[1][0] ?? 0n };
}
