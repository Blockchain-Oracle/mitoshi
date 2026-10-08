"use client";
/**
 * Range reads (Ported from Masayume 68f7a09:web/src/features/range/{useRangeWindows,useRangeRounds}.ts and
 * `useRangeReserve`): the reserve's sheet, the live Windows a band may sit on — Trading, opening print in, a minute or
 * more left (`minTimeLeftSec`), on an asset the reserve can price (its σ and ticker, and a spot the guard verifies);
 * the rest listed apart with the reason — and the wallet's rounds.
 */
import { isOk, statusOf, type Address, type EventMarket, type Reading } from "@cwf/core";
import type { RangeReserveState, RangeRound } from "@cwf/core/range";
import { MARKETS_POLL_MS } from "@cwf/core/constants";
import { getRangeReserveState, listRangesOf, readRangeModels, type RangeModel } from "@cwf/markets/range";
import { useLanes, useReadingQuery } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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

export function useRangeWindows(nowMs: number, minTimeLeftSec: number): { windows: BandWindow[]; loading: boolean } {
  const reading = useLanes();
  const nowSec = Math.floor(nowMs / 1000);
  const live = useMemo(() => {
    const lanes = reading && isOk(reading) ? reading.value.lanes : [];
    return lanes
      .flatMap((l) => l.markets)
      .filter((m) => nowSec > 0 && statusOf(m, nowSec) === "Trading" && m.openingPriceRaw !== null && m.lockAtSec - nowSec >= minTimeLeftSec)
      .sort((a, b) => a.expirySec - b.expirySec || a.asset.localeCompare(b.asset));
  }, [reading, nowSec, minTimeLeftSec]);
  const assets = useMemo(() => [...new Set(live.map((m) => m.asset))].sort(), [live]);
  const models = useQuery({ queryKey: rangeKeys.models(assets.join(",")), queryFn: () => readRangeModels(assets), enabled: assets.length > 0, staleTime: 60_000 });
  return useMemo(() => {
    const windows = live.map((market) => {
      const m = models.data?.get(market.asset) ?? null;
      return { market, model: m && m.sigmaE8 > 0n && m.ticker > 0 && m.feed ? m : null };
    });
    return { windows, loading: reading === null || (assets.length > 0 && models.isPending) };
  }, [live, models.data, models.isPending, reading, assets.length]);
}

export function useRangeRounds(wallet: Address | null): Reading<RangeRound[]> | null {
  return useReadingQuery(rangeKeys.rounds(wallet), () => listRangesOf(wallet as Address), { pollMs: 8_000, enabled: wallet !== null });
}
