"use client";
// §01 — Ported from Owarine 90a91d71:web/src/features/surface/BookReadout.tsx (R4-11, D-227): the opening print (with the
// live spot and which side leads), the UP mid, the spread and the clock, 2×2 on phones; Mitoshi adds a fifth tile, the
// fair-value guard's model UP at the latest signed spot, where the Series has one. Each tile's second line says where
// its number comes from.
import type { BookStructure } from "@cwf/core";
import { bpsToOddsCents, neededMove, type EventMarket } from "@cwf/core";
import type { ReactNode } from "react";
import { Countdown } from "@/components/data/Countdown";
import { usd2 } from "../markets/units";
import { SURFACE } from "./copy";
import { centsText, fairCents, pctOfText } from "./format";

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="sf-tile">
      <div className="sf-tile-k">{label}</div>
      <div className="sf-tile-v">{value}</div>
      <div className="sf-tile-sub">{sub}</div>
    </div>
  );
}

const price = (bps: number) => `${bpsToOddsCents(bps)}¢`;

export function BookReadout({ market, structure, hydrating, spotE8, fairUpE6, modelled, nowMs }: { market: EventMarket; structure: BookStructure | null; hydrating: boolean; spotE8: bigint | null; fairUpE6: bigint | null; modelled: boolean; nowMs: number }) {
  const T = SURFACE.tiles;
  const opening = market.openingPriceRaw;
  const openSub = opening !== null && spotE8 !== null ? `${T.spot(usd2(spotE8))} · ${T.leading(neededMove(spotE8, opening).leading === "up" ? "UP" : "DOWN")}` : spotE8 !== null ? T.spot(usd2(spotE8)) : T.noSpot;
  let up: ReactNode;
  if (!structure) up = <Tile label={T.up.none} value={hydrating ? T.hydrating : "—"} sub={hydrating ? SURFACE.reading : T.empty} />;
  else if (structure.midBps !== null && structure.upAskBps !== null && structure.upBidBps !== null) up = <Tile label={T.up.mid} value={price(structure.midBps)} sub={T.bidAsk(price(structure.upBidBps), price(structure.upAskBps))} />;
  else if (structure.upAskBps !== null) up = <Tile label={T.up.ask} value={price(structure.upAskBps)} sub={structure.crossed ? T.crossedWhy : T.noBids(price(structure.upAskBps))} />;
  else if (structure.upBidBps !== null) up = <Tile label={T.up.bid} value={price(structure.upBidBps)} sub={T.noAsks(price(structure.upBidBps))} />;
  else up = <Tile label={T.up.none} value="—" sub={T.empty} />;
  const spread = !structure ? (
    <Tile label={T.spread} value={hydrating ? T.hydrating : "—"} sub={hydrating ? SURFACE.reading : T.empty} />
  ) : structure.crossed ? (
    <Tile label={T.spread} value={<span className="sf-tile-word">{T.crossed}</span>} sub={T.crossedWhy} />
  ) : structure.spreadBps === null || structure.midBps === null ? (
    <Tile label={T.spread} value="—" sub={structure.levels === 0 ? T.empty : T.oneSided} />
  ) : (
    <Tile label={T.spread} value={centsText(structure.spreadBps)} sub={T.spreadOfMid(pctOfText(structure.spreadBps, structure.midBps))} />
  );
  return (
    <div className="sf-tiles">
      <Tile label={T.opening} value={opening === null ? <span className="sf-tile-pending">{T.pendingPrint}</span> : usd2(opening)} sub={openSub} />
      {up}
      {spread}
      <Tile label={T.close} value={<Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} nowMs={nowMs} />} sub={market.asset} />
      <Tile label={T.model} value={fairUpE6 === null ? "—" : fairCents(fairUpE6)} sub={modelled ? T.modelSub : T.noModel} />
    </div>
  );
}
