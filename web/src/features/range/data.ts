"use client";
/**
 * Range reads (Ported from Masayume 68f7a09:web/src/features/range/{useRangeWindows,useRangeRounds}.ts and
 * `useRangeReserve`): the reserve's sheet, the live Windows a band may sit on — Trading, opening print in, a minute or
 * more left (`minTimeLeftSec`), on an asset the reserve can price (its σ and ticker, and a spot the guard verifies);
 * the rest listed apart with the reason — and the wallet's rounds.
 */
import { isOk, statusOf, type Address, type Diagnosis, type EventMarket, type Reading } from "@cwf/core";
import type { RangeReserveState, RangeRound } from "@cwf/core/range";
import { MARKETS_POLL_MS } from "@cwf/core/constants";
import { getRangeReserveState, listRangesOf, readRangeModels, type RangeModel } from "@cwf/markets/range";
import { useLanes, useReadingQuery } from "@cwf/markets/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

export const rangeKeys = {
  all: ["cwf", "range"] as const,
  reserve: () => ["cwf", "range", "reserve"] as const,
  models: (assets: string) => ["cwf", "range", "models", assets] as const,
  rounds: (wallet: string | null) => ["cwf", "range", "rounds", wallet] as const,
  quote: (signature: string) => ["cwf", "range", "quote", signature] as const,
};

export function useRangeReserve(): Reading<RangeReserveState | null> | null {
  return useReadingQuery(rangeKeys.reserve(), getRangeReserveState, { pollMs: MARKETS_POLL_MS });
}

export interface BandWindow {
  market: EventMarket;
  model: RangeModel | null;
}

export interface RangeWindows {
  /** Trading, print in, entry open, inside the reserve's horizon — soonest close first. */
  windows: BandWindow[];
  /** The cadences (seconds) a priced Window is live on now, shortest first. */
  cadences: number[];
  /** When the next Window opens on any lane (for the empty line), or null when none is listed. */
  nextOpenSec: number | null;
  /** Seconds until a trading Gap Window comes inside the reserve's horizon (its disabled chip), or null. */
  gapInSec: number | null;
  loading: boolean;
  /** The lanes read failed with nothing to show (R4-5 review: it read as "No open Window"). */
  error: Diagnosis | null;
}

/**
 * R4-5 (D-227): every Window the reserve can price, no cut to the soonest four (Ported from Owarine
 * 90a91d71:web/src/features/range/useRangeWindows.ts), and none past `maxHorizonSec` (a weekly Gap is offered only
 * once it is within the reserve's 2 days, never offered then refused `TooFar`).
 */
export function useRangeWindows(nowMs: number, minTimeLeftSec: number, maxHorizonSec: number): RangeWindows {
  const reading = useLanes();
  const nowSec = Math.floor(nowMs / 1000);
  const markets = useMemo(() => (reading && isOk(reading) ? reading.value.lanes.flatMap((l) => l.markets) : []), [reading]);
  const live = useMemo(
    () =>
      markets
        .filter((m) => nowSec > 0 && statusOf(m, nowSec) === "Trading" && m.openingPriceRaw !== null && m.lockAtSec - nowSec >= minTimeLeftSec && m.expirySec - nowSec <= maxHorizonSec)
        .sort((a, b) => a.expirySec - b.expirySec || a.asset.localeCompare(b.asset)),
    [markets, nowSec, minTimeLeftSec, maxHorizonSec],
  );
  const series = useMemo(() => {
    const seen = new Map<string, { asset: string; seriesId: Hex }>();
    for (const m of live) seen.set(m.seriesId.toLowerCase(), { asset: m.asset, seriesId: m.seriesId as Hex });
    return [...seen.values()].sort((a, b) => a.seriesId.localeCompare(b.seriesId));
  }, [live]);
  const models = useQuery({ queryKey: rangeKeys.models(series.map((s) => s.seriesId).join(",")), queryFn: () => readRangeModels(series), enabled: series.length > 0, staleTime: 60_000, placeholderData: keepPreviousData });
  return useMemo(() => {
    const windows = live.map((market) => {
      const m = models.data?.get(market.seriesId.toLowerCase()) ?? null;
      return { market, model: m && m.sigmaE8 > 0n && m.ticker > 0 && m.feed ? m : null };
    });
    const cadences = [...new Set(windows.filter((w) => w.model).map((w) => w.market.intervalSec))].sort((a, b) => a - b);
    const upcoming = markets.filter((m) => m.tradingStartSec > nowSec).map((m) => m.tradingStartSec);
    const farGaps = markets.filter((m) => m.lane === "gap" && nowSec > 0 && statusOf(m, nowSec) === "Trading" && m.expirySec - nowSec > maxHorizonSec).map((m) => m.expirySec - maxHorizonSec - nowSec);
    return { windows, cadences, nextOpenSec: upcoming.length ? Math.min(...upcoming) : null, gapInSec: farGaps.length ? Math.min(...farGaps) : null, loading: reading === null || (series.length > 0 && models.isPending), error: reading && !isOk(reading) ? reading.error : null };
  }, [live, markets, nowSec, maxHorizonSec, models.data, models.isPending, reading, series.length]);
}

export function useRangeRounds(wallet: Address | null): Reading<RangeRound[]> | null {
  return useReadingQuery(rangeKeys.rounds(wallet), () => listRangesOf(wallet as Address), { pollMs: 8_000, enabled: wallet !== null });
}
