"use client";
/**
 * The Window reads the markets surfaces render from (Masayume 68f7a09:packages/markets/src/react/useReads.ts, useBook.ts,
 * useStakeQuote.ts, useAssetPrice.ts, rebuilt on the Tempo port): every hook reads through the port, returns a
 * `Reading` (null only before any answer), and is keyed so the D-049 stream's invalidations (`stream/dispatch.ts`)
 * refresh exactly it — the book, quotes and the opening print sit under their Window's `depth`/`onchain` keys, so a
 * `Fill` or `PrintRecorded` marks them stale with no poll. The polls here are the fallback for a tab whose stream is
 * down. Null-safe on the port: the web builds it after first paint (D-071), so a hook simply waits until it exists.
 */
import { MARKETS_POLL_MS, ONCHAIN_POLL_MS, OPENING_PRINT_POLL_MS, PRICE_POLL_MS, PRICE_STALE_AFTER_MS, REQUOTE_MS, SETTLED_HISTORY_POLL_MS, VERDICT_POLL_MS } from "@cwf/core/constants";
import { isOk, ok, stale } from "@cwf/core";
import type { Address, AssetPrice, BookDepth, EventMarket, ExitQuote, Holdings, LaneSet, MarketId, MarketsProvider, OnchainSnapshot, OpenPosition, PricePoint, Quote, Reading, Resolution, Side } from "@cwf/core";
import type { WalletHistory } from "@cwf/core";
import { useQueries, type QueryKey } from "@tanstack/react-query";
import { useMemo } from "react";
import { useMarketsPort } from "./contexts";
import { keys } from "./keys";
import { usePrice } from "./stream";
import { readingOf, readingQueryOptions, useReadingQuery, type PollInterval } from "./useReadingQuery";

/** A port read that waits for the port; `enabled` and the poll are the caller's. */
export function usePortReading<T>(queryKey: QueryKey, read: (port: MarketsProvider) => Promise<Reading<T>>, options: { enabled?: boolean; pollMs?: PollInterval<T>; staleTimeMs?: number } = {}): Reading<T> | null {
  const port = useMarketsPort();
  const { enabled = true, ...rest } = options;
  return useReadingQuery(queryKey, () => read(port!), { ...rest, enabled: enabled && port !== null });
}

/** Every live Window, grouped into (basis, cadence) lanes; the stream refreshes it on `WindowOpened`/`WindowResolved`. */
export function useLanes(): Reading<LaneSet> | null {
  return usePortReading(keys.lanes(), (p) => p.listLiveLanes(), { pollMs: MARKETS_POLL_MS });
}

export function useMarket(marketId: MarketId | null): Reading<EventMarket | null> | null {
  return usePortReading(keys.market(marketId), (p) => p.getMarket(marketId!), { enabled: marketId !== null, pollMs: MARKETS_POLL_MS });
}

/** The head-fresh lens snapshot — the only read that gates a write (canon #1). */
export function useOnchain(marketId: MarketId | null, pollMs: number | false = ONCHAIN_POLL_MS): Reading<OnchainSnapshot> | null {
  return usePortReading(keys.onchain(marketId), (p) => p.getOnchain(marketId!), { enabled: marketId !== null, pollMs: pollMs || undefined });
}

/** Polls only while the print is pending; a recorded print never changes (FR-7). */
export function useOpeningPrice(marketId: MarketId | null): Reading<bigint | null> | null {
  return usePortReading([...keys.onchain(marketId), "open"], (p) => p.getOpeningPrice(marketId!), {
    enabled: marketId !== null,
    pollMs: (r) => (r && isOk(r) && r.value !== null ? false : OPENING_PRINT_POLL_MS),
  });
}

export function useNextWindow(market: EventMarket | null): Reading<EventMarket | null> | null {
  return usePortReading([...keys.market(market?.marketId ?? null), "next"], (p) => p.nextWindow(market!), { enabled: market !== null, pollMs: OPENING_PRINT_POLL_MS });
}

/** The settlement record; polled until it carries its transaction (it lands a beat after the status flips). */
export function useResolution(marketId: MarketId | null, enabled = true): Reading<Resolution> | null {
  return usePortReading([...keys.onchain(marketId), "resolution"], (p) => p.getResolution(marketId!), {
    enabled: enabled && marketId !== null,
    pollMs: (r) => (r && isOk(r) && r.value.settlementTxHash !== null ? false : VERDICT_POLL_MS),
  });
}

/** Both sides of one Window's book in their own terms (what you pay). */
export function useBookDepth(market: Pick<EventMarket, "marketId" | "decimals"> | null, options: { depth?: number; pollMs?: number } = {}): Reading<BookDepth> | null {
  const marketId = market?.marketId ?? null;
  const { depth = 10, pollMs = ONCHAIN_POLL_MS } = options;
  // One depth read per Window, shared by every card that shows it; a list of many Windows polls slower (the public
  // RPC's per-IP budget, D-134) and leans on the stream's `market:<id>`/`fills` invalidations instead.
  return usePortReading(keys.depth(marketId), (p) => p.getBookDepth({ marketId: marketId!, decimals: market!.decimals }, depth), { enabled: marketId !== null, pollMs });
}

/** `useBookDepth`'s query for one Window — the same key, read and poll — for subscribing to many at once. */
export function bookDepthQuery(port: MarketsProvider | null, market: Pick<EventMarket, "marketId" | "decimals">, options: { depth?: number; pollMs?: number } = {}) {
  const { depth = 10, pollMs = ONCHAIN_POLL_MS } = options;
  return readingQueryOptions(keys.depth(market.marketId), () => port!.getBookDepth({ marketId: market.marketId, decimals: market.decimals }, depth), { enabled: port !== null, pollMs });
}

const readingsOf = (results: readonly { data: Reading<BookDepth> | undefined; isError: boolean; error: unknown }[]) => results.map((r) => readingOf(r));

/**
 * The books of a list of Windows through ONE subscription (D-184): each Window keeps its own depth query (the same
 * key, read and stream invalidation as `useBookDepth`), but the list re-renders once per batch of answers instead of
 * every card on its own. Readings in `markets` order; the array keeps its identity while no book changed.
 */
export function useBookDepths(markets: readonly Pick<EventMarket, "marketId" | "decimals">[], options: { depth?: number; pollMs?: number } = {}): readonly (Reading<BookDepth> | null)[] {
  const port = useMarketsPort();
  return useQueries({ queries: markets.map((m) => bookDepthQuery(port, m, options)), combine: readingsOf });
}

/** The composing ticket's quote, walked fresh off the chain book; re-walked on every book event and every REQUOTE_MS. */
export function useStakeQuote(input: { market: Pick<EventMarket, "marketId" | "decimals" | "intervalSec"> | null; side: Side; stakeBase: bigint; enabled?: boolean }): Reading<Quote | null> | null {
  const { market, side, stakeBase, enabled = true } = input;
  const marketId = market?.marketId ?? null;
  return usePortReading([...keys.depth(marketId), "quote", side, stakeBase.toString()], (p) => p.freshQuoteStake({ marketId: marketId!, decimals: market!.decimals, intervalSec: market!.intervalSec }, side, stakeBase), {
    enabled: enabled && marketId !== null && stakeBase > 0n,
    pollMs: REQUOTE_MS,
  });
}

/** What selling `contractsRaw` of a held side pays right now (cash-out, D-067). */
export function useExitQuote(input: { market: Pick<EventMarket, "marketId" | "decimals"> | null; side: Side | null; contractsRaw: bigint; enabled?: boolean; pollMs?: number }): Reading<ExitQuote | null> | null {
  const { market, side, contractsRaw, enabled = true, pollMs = REQUOTE_MS } = input;
  const marketId = market?.marketId ?? null;
  return usePortReading([...keys.depth(marketId), "exit", side, contractsRaw.toString()], (p) => p.freshExitQuote({ marketId: marketId!, decimals: market!.decimals }, side!, contractsRaw), {
    enabled: enabled && marketId !== null && side !== null && contractsRaw > 0n,
    pollMs,
  });
}

export function usePositions(wallet: Address | null): Reading<OpenPosition[]> | null {
  return usePortReading(keys.positions(wallet), (p) => p.listOpenPositions(wallet!), { enabled: wallet !== null, pollMs: MARKETS_POLL_MS });
}

export function useHoldings(wallet: Address | null, onchain: OnchainSnapshot | null): Reading<Holdings> | null {
  return usePortReading([...keys.positions(wallet), "holdings", onchain?.marketId ?? null], (p) => p.getHoldings(wallet!, onchain!), { enabled: wallet !== null && onchain !== null, pollMs: MARKETS_POLL_MS });
}

/** Settled history — an archive: revalidated slowly, and on every confirmed write and stream event for the wallet. */
export function useWalletHistory(wallet: Address | null, enabled = true): Reading<WalletHistory> | null {
  return usePortReading(keys.history(wallet), (p) => p.listWalletHistory(wallet!), { enabled: enabled && wallet !== null, pollMs: SETTLED_HISTORY_POLL_MS });
}

export function usePriceHistory(asset: string | null, fromSec: number, toSec: number): Reading<PricePoint[]> | null {
  return usePortReading(keys.priceHistory(asset ?? "", fromSec, toSec), (p) => p.getPriceHistory(asset!, fromSec, toSec), {
    enabled: asset !== null && toSec > fromSec,
    staleTimeMs: 60_000,
  });
}

/**
 * The live price: the stream's tick while it flows (`keys.price`, D-049), the ops snapshot polled only while it does
 * not; a tick older than the freshness budget reads stale, never live. `feedKey` is the ops key (`TSLA` / `TSLA-24`).
 */
export function useAssetPrice(feedKey: string | null, nowMs: number): Reading<AssetPrice | null> | null {
  const tick = usePrice(feedKey ?? "");
  const fallback = usePortReading(["cwf", "assetPrice", feedKey], (p) => p.getAssetPrice(feedKey!), { enabled: feedKey !== null && !tick, pollMs: PRICE_POLL_MS });
  return useMemo(() => {
    if (feedKey === null) return null;
    const price: AssetPrice | null = tick
      ? { asset: feedKey, priceRaw: BigInt(tick.priceE8), emaRaw: BigInt(tick.priceE8), decimals: 8, blockTimestampSec: tick.publishTimeSec }
      : fallback && isOk(fallback)
        ? fallback.value
        : null;
    if (!price) return fallback;
    const reading = ok(price, nowMs || Date.now());
    return nowMs > 0 && nowMs - price.blockTimestampSec * 1000 > PRICE_STALE_AFTER_MS ? stale(reading, "aged") : reading;
  }, [feedKey, tick, fallback, nowMs]);
}

/** A Series' grid (lot, tick, cash unit, minimum) — constant for the Series' life; what a scheduled call is sized on. */
export function useSeriesGrid(seriesId: string | null): Reading<{ lotBase: bigint; tickBase: bigint; cashUnit: bigint; minLots: bigint }> | null {
  const port = useMarketsPort();
  return useReadingQuery(
    keys.bookParams(seriesId),
    async () => {
      // The lens module loads on first use, so pages keep viem out of their first load (§3.1).
      const [{ readSeries }, { withReading }] = await Promise.all([import("../engine/lens"), import("../runtime/reading")]);
      return withReading(`grid:${seriesId}`, async () => {
        const s = (await readSeries([seriesId as `0x${string}`])).get(seriesId!.toLowerCase());
        if (!s) throw new Error(`unknown Series ${seriesId}`);
        return { lotBase: s.lotBase, tickBase: s.tickBase, cashUnit: s.cashUnit, minLots: s.minLots };
      });
    },
    { enabled: seriesId !== null && port !== null, staleTimeMs: Number.POSITIVE_INFINITY },
  );
}

export interface RestingOrderView {
  orderId: bigint;
  priceTicks: number;
  lots: bigint;
  expireTsSec: number;
}

/** The wallet's resting orders on one Window (a scheduled call before the bell), for the cancel control. */
export function useOpenOrders(wallet: Address | null, marketId: MarketId | null): Reading<RestingOrderView[]> | null {
  const port = useMarketsPort();
  return useReadingQuery(
    [...keys.positions(wallet), "orders", marketId],
    async () => {
      const [{ readOpenOrders }, { withReading }] = await Promise.all([import("../engine/lens"), import("../runtime/reading")]);
      return withReading(`orders:${wallet}:${marketId}`, () => readOpenOrders(marketId!, wallet!));
    },
    { enabled: wallet !== null && marketId !== null && port !== null, pollMs: MARKETS_POLL_MS },
  );
}
