"use client";
/**
 * The surface's reads (S10e): the live lanes → the assets and each asset's Windows (nearest close first, the
 * reference's selection rule, Masayume 68f7a09:web/src/features/surface/useSurfaceSelection.ts), and per row the book,
 * the signed spot, the path since the open (ops history, bucketed so the key moves every 15 s, with the live spot as
 * its last point) and the guard's model where the Series has one.
 */
import { isOk, laneLabel, type BookDepth, type EventMarket, type Hex, type MarketId } from "@cwf/core";
import { previewLegFair, readFairModels } from "@cwf/markets/parlay";
import { useAssetPrice, useBookDepth, useLanes, usePriceHistory } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { SparkPoint } from "@/components/ui/sparkline";
import { feedKeyOf } from "../markets/units";

export interface SurfaceWindow {
  market: EventMarket;
  label: string;
}

export function useSurfaceSelection() {
  const reading = useLanes();
  const windows = useMemo<SurfaceWindow[]>(() => {
    if (!reading || !isOk(reading)) return [];
    return reading.value.lanes.flatMap((lane) => lane.markets.map((m) => ({ market: m, label: laneLabel(lane.basis, m.intervalSec) }))).sort((a, b) => a.market.expirySec - b.market.expirySec);
  }, [reading]);
  const assets = useMemo(() => [...new Set(windows.map((w) => w.market.asset))], [windows]);
  const [chosen, setChosen] = useState<string | null>(null);
  const asset = chosen !== null && assets.includes(chosen) ? chosen : (assets[0] ?? null);
  const rows = useMemo(() => windows.filter((w) => w.market.asset === asset), [windows, asset]);
  const seriesIds = useMemo(() => [...new Set(rows.map((w) => w.market.seriesId as Hex))], [rows]);
  const models = useQuery({ queryKey: ["cwf", "surface", "models", seriesIds.join(",")], queryFn: () => readFairModels(seriesIds), enabled: seriesIds.length > 0, staleTime: 5 * 60_000 });
  return { reading, assets, asset, setAsset: setChosen, rows, models: models.data ?? null };
}

export interface RowFigures {
  book: BookDepth | null;
  bookFailed: boolean;
  upAskBps: number | null;
  upBidBps: number | null;
  spreadBps: number | null;
  bidDepthRaw: bigint;
  askDepthRaw: bigint;
  spotE8: bigint | null;
  fairUpE6: bigint | null;
  path: SparkPoint[];
}

const BUCKET_SEC = 15;

export function useRowFigures(market: EventMarket, modelled: boolean, nowMs: number): RowFigures {
  const depth = useBookDepth(market, { depth: 20, pollMs: 20_000 });
  const feed = feedKeyOf(market);
  const price = useAssetPrice(feed, nowMs);
  const spotE8 = price?.ok && price.value ? price.value.priceRaw : null;
  const nowSec = Math.floor(nowMs / 1000);
  const toSec = Math.min(market.expirySec, Math.floor(nowSec / BUCKET_SEC) * BUCKET_SEC);
  const history = usePriceHistory(feed, market.tradingStartSec, toSec);
  const spotBucket = spotE8 === null ? "" : (spotE8 / 1_000_000n).toString();
  const fair = useQuery({
    queryKey: ["cwf", "surface", "fair", market.marketId, spotBucket],
    queryFn: async () => (await previewLegFair([{ marketId: market.marketId as MarketId, side: "up" }], [spotE8!]))[0]!,
    enabled: modelled && spotE8 !== null && nowSec < market.lockAtSec,
    staleTime: 10_000,
  });
  return useMemo(() => {
    const book = depth && isOk(depth) ? depth.value : null;
    const asks = book ? [...book.upAsks].sort((a, b) => a.priceBps - b.priceBps) : [];
    const bids = book ? [...book.upBids].sort((a, b) => b.priceBps - a.priceBps) : [];
    const upAskBps = asks[0]?.priceBps ?? null;
    const upBidBps = bids[0]?.priceBps ?? null;
    const path: SparkPoint[] = history && isOk(history) ? history.value.map((p) => ({ tSec: p.blockTimestampSec, priceE8: p.priceRaw })) : [];
    if (spotE8 !== null && nowSec <= market.expirySec && (path.length === 0 || path[path.length - 1]!.tSec < nowSec)) path.push({ tSec: nowSec, priceE8: spotE8 });
    return {
      book,
      bookFailed: depth !== null && !isOk(depth),
      upAskBps,
      upBidBps,
      spreadBps: upAskBps !== null && upBidBps !== null ? upAskBps - upBidBps : null,
      bidDepthRaw: bids.reduce((s, l) => s + l.quantityRaw, 0n),
      askDepthRaw: asks.reduce((s, l) => s + l.quantityRaw, 0n),
      spotE8,
      fairUpE6: fair.data ?? null,
      path,
    };
  }, [depth, history, spotE8, nowSec, market.expirySec, fair.data]);
}
