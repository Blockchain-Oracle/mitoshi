"use client";
/**
 * The markets ticket's Range mode (Masayume 68f7a09:web/src/features/markets/ticket range branch, `useRangeTicket.ts`):
 * the RangeReserve's sheet and whether it can price this Window's asset, then the band body — inside only, as the
 * reference's ticket — with the band drawn on the hero chart (E.1, a Masayume gap). A lazy island of the ticket.
 * R4-5 (D-227): the model is read per Series (σ falls back to the guard's), so every lane the reserve prices shows.
 * R4-3 review (D-227) brought `prediction-ticket.css` for the body's 16240 amount field and quick adds; R4-5 replaced
 * them with the TicketStrip (its styles in `range.css`), so the island brings `range.css` only.
 */
import type { EventMarket } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import { readRangeModels } from "@cwf/markets/range";
import type { Hex } from "viem";
import { EmptyState, LoadingState, ReadingBoundary } from "@/components/states";
import { RANGE } from "./copy";
import { rangeKeys, useRangeReserve } from "./data";
import { RangeTicketBody } from "./RangeTicketBody";
import "@/styles/range.css";

export function RangeTicketMode({ market }: { market: EventMarket }) {
  const reading = useRangeReserve();
  const models = useQuery({ queryKey: rangeKeys.models(market.seriesId), queryFn: () => readRangeModels([{ asset: market.asset, seriesId: market.seriesId as Hex }]), staleTime: 60_000 });
  if (models.isPending) return <LoadingState shape="ticket" />;
  const m = models.data?.get(market.seriesId.toLowerCase()) ?? null;
  const model = m && m.sigmaE8 > 0n && m.ticker > 0 && m.feed ? m : null;
  return (
    <ReadingBoundary reading={reading} shape="ticket">
      {(reserve) => (reserve ? <RangeTicketBody key={market.marketId} market={market} model={model} reserve={reserve} drawOnChart /> : <EmptyState why={RANGE.notDeployed} />)}
    </ReadingBoundary>
  );
}
