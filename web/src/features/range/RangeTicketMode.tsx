"use client";
/**
 * The markets ticket's Range mode (Masayume 68f7a09:web/src/features/markets/ticket range branch, `useRangeTicket.ts`):
 * the RangeReserve's sheet and whether it can price this Window's asset, then the band body — inside only, as the
 * reference's ticket — with the band drawn on the hero chart (E.1, a Masayume gap). A lazy island of the ticket.
 * R4-3 review (D-227): the band body's amount field and quick adds are 21st 16240's (`prediction-ticket.css`); the
 * markets ticket stopped importing that sheet when its own blocks became Owarine's, so this island brings it.
 */
import type { EventMarket } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import { readRangeModels } from "@cwf/markets/range";
import { EmptyState, LoadingState, ReadingBoundary } from "@/components/states";
import { RANGE } from "./copy";
import { rangeKeys, useRangeReserve } from "./data";
import { RangeTicketBody } from "./RangeTicketBody";
import "@/styles/prediction-ticket.css";
import "@/styles/range.css";

export function RangeTicketMode({ market }: { market: EventMarket }) {
  const reading = useRangeReserve();
  const models = useQuery({ queryKey: rangeKeys.models(market.asset), queryFn: () => readRangeModels([market.asset]), staleTime: 60_000 });
  if (models.isPending) return <LoadingState shape="ticket" />;
  const m = models.data?.get(market.asset) ?? null;
  const model = m && m.sigmaE8 > 0n && m.ticker > 0 && m.feed ? m : null;
  return (
    <ReadingBoundary reading={reading} shape="ticket">
      {(reserve) => (reserve ? <RangeTicketBody key={market.marketId} market={market} model={model} reserve={reserve} drawOnChart /> : <EmptyState why={RANGE.notDeployed} />)}
    </ReadingBoundary>
  );
}
