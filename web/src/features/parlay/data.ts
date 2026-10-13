"use client";
/**
 * The parlay surface's reads (Ported from Masayume 68f7a09:web/src/features/parlay/{useParlayWindows,useParlayTickets}.ts
 * and `useParlayReserve`): the reserve's sheet, the live Windows a leg may name — Trading, opening print recorded,
 * entry still open, and modelled by the fair-value guard (a leg on a lane without σ or a spot source is refused
 * `SigmaNotSet`/`NoSpotSource`, so the list says so instead of offering it) — and the wallet's tickets.
 */
import { isOk, statusOf, type Address, type EventMarket, type MarketId, type ParlayReserveState, type Reading } from "@cwf/core";
import { MARKETS_POLL_MS } from "@cwf/core/constants";
import { listParlaysOf, readFairModels, readParlayReserve, type FairModel, type ParlayTicketView } from "@cwf/markets/parlay";
import { useLanes, useReadingQuery } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

/** Seconds of entry a leg needs left: the open is priced, signed and sent before `lockAt` with room to spare. */
export const MIN_ENTRY_LEFT_SEC = 25;
/** A leg settles the moment its Window does; the slip reads fast enough that a won ticket never reads "open" for long. */
const TICKETS_POLL_MS = 8_000;

export const parlayKeys = {
  all: ["cwf", "parlay"] as const,
  reserve: () => ["cwf", "parlay", "reserve"] as const,
  models: (ids: string) => ["cwf", "parlay", "models", ids] as const,
  tickets: (wallet: string | null) => ["cwf", "parlay", "tickets", wallet] as const,
  quote: (signature: string) => ["cwf", "parlay", "quote", signature] as const,
  fair: (signature: string) => ["cwf", "parlay", "fair", signature] as const,
};

export function useParlayReserve(): Reading<ParlayReserveState | null> | null {
  return useReadingQuery(parlayKeys.reserve(), readParlayReserve, { pollMs: MARKETS_POLL_MS });
}

export interface LegWindow {
  market: EventMarket;
  /** The guard can model it (σ for its Series and a spot feed for its ticker). */
  model: FairModel | null;
}

export interface ParlayWindows {
  /** Trading, print in, entry open — soonest close first; `model` null means it cannot be priced into a parlay. */
  windows: LegWindow[];
  byId: Map<MarketId, LegWindow>;
  /** When the next Window opens on any lane (the empty line), or null when none is listed (R4-5). */
  nextOpenSec: number | null;
  loading: boolean;
  error: boolean;
}

export function useParlayWindows(nowMs: number): ParlayWindows {
  const reading = useLanes();
  const nowSec = Math.floor(nowMs / 1000);
  const live = useMemo(() => {
    const lanes = reading && isOk(reading) ? reading.value.lanes : [];
    return lanes
      .flatMap((lane) => lane.markets)
      .filter((m) => nowSec > 0 && statusOf(m, nowSec) === "Trading" && m.openingPriceRaw !== null && m.lockAtSec - nowSec >= MIN_ENTRY_LEFT_SEC)
      .sort((a, b) => a.expirySec - b.expirySec || a.asset.localeCompare(b.asset));
  }, [reading, nowSec]);
  const seriesIds = useMemo(() => [...new Set(live.map((m) => m.seriesId.toLowerCase()))].sort(), [live]);
  const models = useQuery({
    queryKey: parlayKeys.models(seriesIds.join(",")),
    queryFn: () => readFairModels(seriesIds as Hex[]),
    enabled: seriesIds.length > 0,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const byModel = models.data;
    const windows = live.map((market) => {
      const m = byModel?.get(market.seriesId.toLowerCase()) ?? null;
      return { market, model: m && m.sigmaE8 > 0n && m.feed ? m : null };
    });
    const upcoming = (reading && isOk(reading) ? reading.value.lanes.flatMap((l) => l.markets) : []).filter((m) => m.tradingStartSec > nowSec).map((m) => m.tradingStartSec);
    return { windows, byId: new Map(windows.map((w) => [w.market.marketId, w])), nextOpenSec: upcoming.length ? Math.min(...upcoming) : null, loading: reading === null || (seriesIds.length > 0 && models.isPending), error: models.isError };
  }, [live, models.data, models.isPending, models.isError, reading, seriesIds.length, nowSec]);
}

export function useParlayTickets(wallet: Address | null): Reading<ParlayTicketView[]> | null {
  return useReadingQuery(parlayKeys.tickets(wallet), () => listParlaysOf(wallet as Address), { pollMs: TICKETS_POLL_MS, enabled: wallet !== null });
}
