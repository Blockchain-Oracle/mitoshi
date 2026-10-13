"use client";
// §03 — Ported from Owarine 90a91d71:web/src/features/surface/SlippageLadder.tsx (R4-11, D-227): every stake priced off the
// book, walked as an IOC taker would be, for the side chosen; the rows the visible book can't fill in full are marked.
// The lot is the Series' own grid; the engine takes no settlement fee (pathUSD in, pathUSD out).
import { bpsToOddsCents, slippageLadder, stakeLadder, type BookDepth, type SlippageRow } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SURFACE } from "./copy";
import { centsText, contractsText, lotText } from "./format";

const SIDES = ["up", "down"] as const;
const WORD = { up: "UP", down: "DOWN" } as const;

function Row({ row, decimals }: { row: SlippageRow; decimals: number }) {
  const L = SURFACE.ladder;
  const nothing = row.contractsRaw === 0n;
  return (
    <div className={cn("sf-row", row.exhausted && "sf-row--beyond")}>
      <span className="sf-row-stake">${formatBaseUnits(row.stakeBase, decimals, { minDp: 0 })}</span>
      <span className="sf-row-num">{row.avgPriceBps === null ? "—" : `${bpsToOddsCents(row.avgPriceBps)}¢`}</span>
      <span className={cn("sf-row-num", row.slippageBps !== null && row.slippageBps > 0 && "sf-row-slip")}>{row.slippageBps === null ? "—" : row.slippageBps === 0 ? "0¢" : `+${centsText(row.slippageBps)}`}</span>
      <span className="sf-row-num">{nothing ? "—" : contractsText(row.contractsRaw, decimals)}</span>
      <span className="sf-row-num sf-row-pays">{nothing || row.payoutIfRightBase === null ? "—" : `$${formatBaseUnits(row.payoutIfRightBase, decimals)}`}</span>
      <span className="sf-row-fill">{nothing ? L.nothing : row.exhausted ? L.beyond : L.full}</span>
    </div>
  );
}

export function SlippageLadder({ depth, lotRaw }: { depth: BookDepth | null; lotRaw: bigint | null }) {
  const [side, setSide] = useState<(typeof SIDES)[number]>("up");
  const L = SURFACE.ladder;
  const asks = depth ? (side === "up" ? depth.upAsks : depth.downAsks) : [];
  const ready = depth !== null && lotRaw !== null;
  const rows = ready ? slippageLadder(asks, stakeLadder(depth.decimals), depth.decimals, lotRaw, 0) : [];
  return (
    <div className="sf-ladder">
      <div className="sf-chips-group" role="group" aria-label={L.side("")}>
        {SIDES.map((s) => (
          <button key={s} type="button" className={cn("sf-chip sf-chip--window", side === s && "sf-chip--on")} aria-pressed={side === s} onClick={() => setSide(s)}>{L.side(WORD[s])}</button>
        ))}
      </div>
      <div className="sf-box sf-box--table">
        <div className="sf-row sf-row--head">
          <span>{L.stake}</span>
          <span className="sf-row-num">{L.avg}</span>
          <span className="sf-row-num">{L.vsTop}</span>
          <span className="sf-row-num">{L.contracts}</span>
          <span className="sf-row-num">{L.pays}</span>
          <span className="sf-row-fill">{L.fill}</span>
        </div>
        {!ready ? <div className="sf-box-empty">{SURFACE.reading}</div> : asks.length === 0 ? <div className="sf-box-empty">{L.empty(WORD[side])}</div> : rows.map((r) => <Row key={r.stakeBase.toString()} row={r} decimals={depth.decimals} />)}
      </div>
      {ready ? <p className="sf-params">{L.lot(lotText(lotRaw, depth.decimals))}</p> : null}
    </div>
  );
}
