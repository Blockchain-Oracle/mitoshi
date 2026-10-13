"use client";
// §04 — Ported from Owarine 90a91d71:web/src/features/surface/TermStructure.tsx (R4-11, D-227): the curve, then the same
// Windows as rows — cadence, the clock, the line each settles against, what each side costs, the guard's model (Mitoshi's
// column), the spread and the depth. This is the old sortable table's place; the rows show from 768 px, the curve always.
// Every row is a live Window of the asset on its own book; hydrating reads "…", a failed read says so.
import { bpsToOddsCents, termPoints, type EventMarket, type MarketId, type TermPoint } from "@cwf/core";
import { useBookDepths } from "@cwf/markets/react";
import { useMemo } from "react";
import { Countdown } from "@/components/data/Countdown";
import { cn } from "@/lib/utils";
import { usd2 } from "../markets/units";
import { SURFACE } from "./copy";
import { centsText, contractsText, fairCents } from "./format";
import { TermChart } from "./TermChart";
import { useFairUp } from "./useSurface";

const price = (bps: number | null) => (bps === null ? "—" : `${bpsToOddsCents(bps)}¢`);

function Row({ point, market, modelled, spotE8, decimals, nowMs, focal, onPick }: { point: TermPoint; market: EventMarket; modelled: boolean; spotE8: bigint | null; decimals: number; nowMs: number; focal: boolean; onPick: (id: MarketId) => void }) {
  const fair = useFairUp(market, modelled, spotE8, nowMs);
  const s = point.structure;
  return (
    <button type="button" className={cn("sf-trow", focal && "sf-trow--focal")} aria-pressed={focal} onClick={() => onPick(point.marketId)}>
      <span className="sf-trow-window"><b>{point.cadence}</b> {point.asset}</span>
      <span className="sf-row-num"><Countdown expirySec={point.expirySec} intervalSec={point.intervalSec} nowMs={nowMs} /></span>
      <span className="sf-row-num">{point.openingPriceRaw === null ? "—" : usd2(point.openingPriceRaw)}</span>
      <span className="sf-row-num sf-trow-up">{s ? price(s.upAskBps) : "…"}</span>
      <span className="sf-row-num">{s ? price(s.downAskBps) : "…"}</span>
      <span className="sf-row-num">{fair === null ? "—" : fairCents(fair)}</span>
      <span className="sf-row-num">{!s ? "…" : s.crossed ? <span className="sf-trow-crossed">{SURFACE.term.crossed}</span> : s.spreadBps === null ? "—" : centsText(s.spreadBps)}</span>
      <span className="sf-row-num">{s ? `${contractsText(s.upBidDepthRaw, decimals)} / ${contractsText(s.upAskDepthRaw, decimals)}` : point.unavailable ? SURFACE.term.unavailable : "…"}</span>
    </button>
  );
}

export function TermStructure({ windows, modelled, spotE8, nowMs, focalId, onPick }: { windows: readonly EventMarket[]; modelled: (m: EventMarket) => boolean; spotE8: bigint | null; nowMs: number; focalId: MarketId | null; onPick: (id: MarketId) => void }) {
  const books = useBookDepths(windows, { depth: 10, pollMs: 30_000 });
  const tick = Math.floor(nowMs / 1000);
  // The points carry the countdown, so they re-derive each second; the books only when a read lands.
  const points = useMemo(() => termPoints(windows.map((market, i) => ({ market, book: books[i] ?? null })), tick * 1000), [windows, books, tick]);
  const byId = new Map(windows.map((m) => [m.marketId, m]));
  const C = SURFACE.term.columns;
  return (
    <div className="sf-termwrap">
      <TermChart points={points} focalId={focalId} onPick={onPick} />
      <div className="sf-box sf-box--table sf-ttable">
        <div className="sf-trow sf-trow--head">
          <span>{C.window}</span>
          <span className="sf-row-num">{C.closes}</span>
          <span className="sf-row-num">{C.print}</span>
          <span className="sf-row-num">{C.up}</span>
          <span className="sf-row-num">{C.down}</span>
          <span className="sf-row-num">{C.model}</span>
          <span className="sf-row-num">{C.spread}</span>
          <span className="sf-row-num">{C.depth}</span>
        </div>
        {points.map((p) => (
          <Row key={p.marketId} point={p} market={byId.get(p.marketId)!} modelled={modelled(byId.get(p.marketId)!)} spotE8={spotE8} decimals={byId.get(p.marketId)!.decimals} nowMs={nowMs} focal={p.marketId === focalId} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
