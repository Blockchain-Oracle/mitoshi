/**
 * The Window-side provider methods (plan C.2.2), Tempo edition: the index discovers ids, the lens answers head-fresh.
 * Every method returns a `Reading`; an engine missing on this chain is the typed "not deployed" reading.
 * Replaces Masayume 68f7a09:packages/markets/src/provider/{markets,onchain,books,quotes,next-window,resolution}.ts.
 */
import { getAbiItem, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { diagnosis, err, groupIntoLanes, ONCHAIN_STATUS, statusOf, toMarketId, type BookDepth, type BookParams, type BookTarget, type EventMarket, type ExitQuote, type LaneSet, type MarketId, type OnchainSnapshot, type Quote, type QuoteTarget, type Reading, type Resolution, type SeriesId, type Side } from "@cwf/core";
import { ReadingError } from "../errors/reading-error";
import { notDeployed } from "../deployments";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { nowMs, nowSec } from "../runtime/clock";
import { withReading } from "../runtime/reading";
import { EngineNotDeployedError, engineVenue, latestWindowIds, readBook, readSeries, readWindows, type WindowFacts } from "../engine/lens";
import { marketIdOf } from "../ops/venue";
import { depthFromBook, exitFromBook, quoteFromBook } from "../engine/quote";
import { indexLiveIds, indexSettledIds, IndexUnavailableError } from "./index-api";
import { DEFAULT_LOOKBACK_BLOCKS, LOG_WINDOW } from "./chain-logs";

export const EXIT_LOCKED = "No exit liquidity: this Window has locked, it pays at settlement";

/** Runs a read; an engine that isn't deployed answers the typed reading instead of an error. */
export async function engineReading<T>(key: string, read: () => Promise<T>): Promise<Reading<T>> {
  try {
    await engineVenue();
  } catch (error) {
    if (error instanceof EngineNotDeployedError) return notDeployed<T>("engine", error.chainId);
    return err(diagnosis("rpc-down", error instanceof Error ? error.message : String(error)));
  }
  return withReading(key, () => read());
}

/** Index first; the lens's own Series listing when the index can't answer (real data either way). */
async function discover(fromIndex: () => Promise<MarketId[]>, lookback: number): Promise<MarketId[]> {
  try {
    return await fromIndex();
  } catch (error) {
    if (!(error instanceof IndexUnavailableError)) throw error;
    return latestWindowIds(lookback);
  }
}

export async function windowFacts(marketId: MarketId): Promise<WindowFacts> {
  const facts = (await readWindows([marketId])).get(marketId);
  if (!facts) throw new ReadingError(diagnosis("market-not-trading", `unknown Window ${marketId}`, { errorName: "UnknownMarket" }));
  return facts;
}

export const listLiveLanes = (): Promise<Reading<LaneSet>> =>
  engineReading("lanes", async () => {
    const now = nowSec();
    const ids = await discover(() => indexLiveIds(now), 2);
    const windows = [...(await readWindows(ids)).values()].map((w) => w.market);
    return groupIntoLanes(windows.filter((m) => m.state === "open" && m.lockAtSec > now));
  });

export const getMarket = (marketId: MarketId): Promise<Reading<EventMarket | null>> =>
  engineReading(`market:${marketId}`, async () => (await readWindows([marketId])).get(marketId)?.market ?? null);

export const listSettled = (limit = 50): Promise<Reading<EventMarket[]>> =>
  engineReading(`settled:${limit}`, async () => {
    const ids = await discover(() => indexSettledIds(limit), 4);
    const windows = [...(await readWindows(ids)).values()].map((w) => w.market).filter((m) => m.state !== "open");
    return windows.sort((a, b) => b.expirySec - a.expirySec).slice(0, limit);
  });

/** Head-fresh snapshot: the only read that may gate a write (canon #1). */
export const getOnchain = (marketId: MarketId): Promise<Reading<OnchainSnapshot>> =>
  engineReading(`onchain:${marketId}`, async () => (await windowFacts(marketId)).snapshot);

export const getBookDepth = (target: BookTarget, depth = 10): Promise<Reading<BookDepth>> =>
  engineReading(`depth:${target.marketId}:${depth}`, async () => {
    const w = await windowFacts(target.marketId);
    return depthFromBook(await readBook(target.marketId, w.series.minRestSec, depth), w.series);
  });

export const getBookParams = (seriesId: SeriesId): Promise<Reading<BookParams>> =>
  engineReading(`params:${seriesId}`, async () => {
    const s = (await readSeries([seriesId as Hex])).get(seriesId.toLowerCase())!;
    return { tickSizeRaw: s.tickBase, lotSizeRaw: s.lotBase, minQuantityRaw: s.minLots * s.lotBase };
  });

/** Watch-free: the book straight off the chain, what the order lane re-quotes with at click time. */
export const freshQuoteStake = (target: QuoteTarget, side: Side, stakeBase: bigint): Promise<Reading<Quote | null>> =>
  engineReading(`quote:${target.marketId}:${side}:${stakeBase}`, async () => {
    const w = await windowFacts(target.marketId);
    return quoteFromBook(await readBook(target.marketId, w.series.minRestSec), w.series, side, stakeBase, nowMs());
  });

/** The exit for a cash-out (D-067); a Window that is not trading has no exit, it pays at settlement. */
export const freshExitQuote = (target: BookTarget, side: Side, contractsRaw: bigint): Promise<Reading<ExitQuote | null>> =>
  engineReading(`exit:${target.marketId}:${side}:${contractsRaw}`, async () => {
    const w = await windowFacts(target.marketId);
    if (w.status !== ONCHAIN_STATUS.Trading) throw new ReadingError(diagnosis("market-not-trading", EXIT_LOCKED));
    return exitFromBook(await readBook(target.marketId, w.series.minRestSec), w.series, side, contractsRaw / w.series.lotBase, nowMs());
  });

export const getOpeningPrice = (marketId: MarketId): Promise<Reading<bigint | null>> =>
  engineReading(`open:${marketId}`, async () => (await windowFacts(marketId)).snapshot.prints.open?.priceE8 ?? null);

/** The Series' next Window after `market`, once the roller has listed it; null before. */
export const nextWindow = (market: EventMarket): Promise<Reading<EventMarket | null>> =>
  engineReading(`next:${market.marketId}`, async () => {
    const id = toMarketId(marketIdOf(market.seriesId, market.index + 1n));
    return (await readWindows([id])).get(id)?.market ?? null;
  });

const RESOLVED = getAbiItem({ abi: eventsEngineAbi, name: "WindowResolved" });

/** Both prints, the source, and the settlement transaction (the engine's `WindowResolved` log for this Window). */
export const getResolution = (marketId: MarketId): Promise<Reading<Resolution>> =>
  engineReading(`resolution:${marketId}`, async () => {
    const w = await windowFacts(marketId);
    let settlementTxHash: Hex | null = null;
    if (w.snapshot.state !== "open") {
      const [client, venue] = await Promise.all([getLogClient(), engineVenue()]);
      const head = await client.getBlockNumber();
      const floor = head > DEFAULT_LOOKBACK_BLOCKS ? head - DEFAULT_LOOKBACK_BLOCKS : 0n;
      for (let end = head; end >= floor && end >= venue.deployBlock && !settlementTxHash; end -= LOG_WINDOW) {
        const start = end - LOG_WINDOW + 1n > venue.deployBlock ? end - LOG_WINDOW + 1n : venue.deployBlock;
        const logs = await client.getLogs({ address: venue.engine, event: RESOLVED, args: { marketId }, fromBlock: start, toBlock: end });
        settlementTxHash = logs[0]?.transactionHash ?? null;
        if (start === venue.deployBlock) break;
      }
    }
    return {
      openingRaw: w.snapshot.prints.open?.priceE8 ?? null,
      closingRaw: w.snapshot.prints.close?.priceE8 ?? null,
      settlementTxHash,
      printSource: w.market.printSource,
      settledAtMs: w.market.resolvedAtMs,
      voided: w.snapshot.state === "voided",
    };
  });

/** The clock-derived status for a snapshot (a stored terminal state wins), for surfaces that hold only the snapshot. */
export const snapshotStatus = (s: OnchainSnapshot) => statusOf(s, nowSec());
