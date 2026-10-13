"use client";
/**
 * The surface's reads (S10e; R4-11, D-227) — Ported from Owarine 90a91d71:web/src/features/surface/useSurfaceSelection.ts
 * and useFocalBook.ts on Mitoshi's hooks: the asset defaults to the soonest-closing Window's, the focal Window is kept by
 * id (it falls to the next when it closes), and the focal Window's book, Series grid, signed spot and the guard's model
 * are read once each. The model's memo keys on the spot and a 15 s bucket, never the clock's every second (the table
 * re-rendered every row every second before, R4-11 bug).
 */
import { isOk, laneLabel, type BookDepth, type EventMarket, type Hex, type MarketId, type Reading } from "@cwf/core";
import { previewLegFair, readFairModels } from "@cwf/markets/parlay";
import { useAssetPrice, useBookDepth, useLanes, useSeriesGrid } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { feedKeyOf } from "../markets/units";

/** The guard models a Series only with its σ set and a spot source for its ticker (the reserves refuse the rest). */
const isModelled = (m: { sigmaE8: bigint; feed: string | null } | undefined) => m !== undefined && m.sigmaE8 > 0n && m.feed !== null;

export function useSurfaceSelection() {
  const reading = useLanes();
  const all = useMemo<EventMarket[]>(() => (reading && isOk(reading) ? reading.value.lanes.flatMap((lane) => lane.markets).sort((a, b) => a.expirySec - b.expirySec) : []), [reading]);
  const labels = useMemo(() => new Map(reading && isOk(reading) ? reading.value.lanes.flatMap((l) => l.markets.map((m) => [m.marketId, laneLabel(l.basis, m.intervalSec)] as const)) : []), [reading]);
  const assets = useMemo(() => [...new Set(all.map((m) => m.asset))], [all]);
  const [chosen, setChosen] = useState<string | null>(null);
  const asset = chosen !== null && assets.includes(chosen) ? chosen : (assets[0] ?? null);
  const windows = useMemo(() => all.filter((m) => m.asset === asset), [all, asset]);
  const [focalId, setFocal] = useState<MarketId | null>(null);
  const focal = windows.find((m) => m.marketId === focalId) ?? windows[0] ?? null;
  const seriesIds = useMemo(() => [...new Set(windows.map((m) => m.seriesId as Hex))], [windows]);
  const models = useQuery({ queryKey: ["cwf", "surface", "models", seriesIds.join(",")], queryFn: () => readFairModels(seriesIds), enabled: seriesIds.length > 0, staleTime: 5 * 60_000 });
  const modelled = (m: EventMarket) => isModelled(models.data?.get(m.seriesId.toLowerCase()));
  const setAsset = (a: string) => (setChosen(a), setFocal(null));
  return { reading, assets, asset, setAsset, windows, focal, setFocal, labels, modelled };
}

const BUCKET_SEC = 15;

export interface FocalFigures {
  book: Reading<BookDepth> | null;
  lotRaw: bigint | null;
  spotE8: bigint | null;
  fairUpE6: bigint | null;
}

/** The guard's model UP for one Window at the latest signed spot (crypto Windows with a σ); null elsewhere. */
export function useFairUp(market: EventMarket | null, modelled: boolean, spotE8: bigint | null, nowMs: number): bigint | null {
  const bucket = Math.floor(nowMs / 1000 / BUCKET_SEC);
  const spotBucket = spotE8 === null ? "" : (spotE8 / 1_000_000n).toString();
  const open = market !== null && Math.floor(nowMs / 1000) < market.lockAtSec;
  const fair = useQuery({
    queryKey: ["cwf", "surface", "fair", market?.marketId ?? null, spotBucket, bucket],
    queryFn: async () => (await previewLegFair([{ marketId: market!.marketId as MarketId, side: "up" }], [spotE8!]))[0]!,
    enabled: market !== null && modelled && spotE8 !== null && open,
    staleTime: 10_000,
  });
  return fair.data ?? null;
}

export function useFocalFigures(market: EventMarket | null, modelled: boolean, nowMs: number): FocalFigures {
  const book = useBookDepth(market, { depth: 20, pollMs: 20_000 });
  const grid = useSeriesGrid(market?.seriesId ?? null);
  const price = useAssetPrice(market ? feedKeyOf(market) : "", nowMs);
  const spotE8 = market && price?.ok && price.value ? price.value.priceRaw : null;
  const fairUpE6 = useFairUp(market, modelled, spotE8, nowMs);
  return { book: market ? book : null, lotRaw: grid?.ok ? grid.value.lotBase : null, spotE8, fairUpE6 };
}
