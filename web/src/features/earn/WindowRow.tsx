"use client";
/**
 * One Window the maker vault is on (R4-7, D-227; earn spec step 6d–e) — Owarine 90a91d71 `features/earn/WindowsTable.tsx`'s
 * row as one DOM for every width (the row-list grammar of 21st.dev 20110 ssychui/market-watchlist): the Window, its
 * inventory skew, what is deployed against the per-Window cap, the time left, and the one action that applies. Merge
 * only while the Window trades — after lock the contract refuses it (`MarketNotTrading`, R4-7 bug 1); Settle once the
 * engine has resolved it. Tap the name for the Window's book (the grid-rows reveal of `components/ui/data-table.tsx`,
 * 21st.dev 31861, `inert` while closed); a failed Merge or Settle shows its card here, in the row that was tapped.
 */
import { formatCadence, statusOf, type MarketId } from "@cwf/core";
import type { MakerWindowRow } from "@cwf/markets/maker";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { PillButton } from "@/components/kit";
import { Countdown, UtcTime } from "@/components/data";
import { TxFailureCard, type TxRunner } from "@/components/tx";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { cn } from "@/lib/utils";
import { EARN } from "./copy";
import { CapMeter, contracts, InventoryBar } from "./InventoryBar";
import { money2, signed2 } from "./format";
import type { RowAction } from "./useEarnWrites";

export interface WindowRowProps {
  row: MakerWindowRow;
  nowMs: number;
  /** The vault's per-Window cap (`params.maxWindowDeployedBase`). */
  capBase: bigint;
  busyRow: RowAction | null;
  lastRow: RowAction | null;
  rowTx: TxRunner;
  open: boolean;
  onToggle: () => void;
  onMerge: (marketId: MarketId) => void;
  onSettle: (marketId: MarketId) => void;
}

/** What a row can do now, on the chain's clock (`nowMs` 0 means not yet known: nothing is offered). */
export function rowActions(row: MakerWindowRow, nowMs: number) {
  const { view, market, settleable } = row;
  const status = market && nowMs > 0 ? statusOf(market, Math.floor(nowMs / 1000)) : null;
  const pairs = view.yesRaw < view.noRaw ? view.yesRaw : view.noRaw;
  return {
    status,
    canMerge: !view.settled && pairs > 0n && status === "Trading",
    canSettle: !view.settled && settleable,
    expired: market !== null && nowMs > 0 && market.expirySec * 1000 <= nowMs,
  };
}

export function WindowRow({ row, nowMs, capBase, busyRow, lastRow, rowTx, open, onToggle, onMerge, onSettle }: WindowRowProps) {
  const { windows } = EARN;
  const { view, market } = row;
  const id = view.marketId;
  const act = rowActions(row, nowMs);
  const failed = rowTx.state.kind === "failed" && (lastRow === `merge:${id}` || lastRow === `settle:${id}`) ? rowTx.state : null;
  const expanded = open || failed !== null;
  const label = market ? `${market.asset} ${formatCadence(market.intervalSec)}` : windows.reading;
  const word = view.settled ? null : act.expired ? windows.printPending : act.status === "Locked" || act.status === "AwaitingClose" ? windows.locked : view.yesRaw === 0n && view.noRaw === 0n ? windows.resting : null;
  const button = (kind: "merge" | "settle", onClick: (m: MarketId) => void) => (
    <PillButton tone={kind === "settle" ? "ink" : "ghost"} size="sm" disabled={busyRow !== null} onClick={() => onClick(id)} className="ea-row-pill">
      {busyRow === `${kind}:${id}` ? windows.busy : kind === "settle" ? windows.settle : windows.merge}
    </PillButton>
  );
  return (
    <li className="ea-row" data-settled={view.settled ? "" : undefined} data-open={expanded ? "" : undefined}>
      <button type="button" className="ea-row-name" aria-expanded={expanded} aria-label={windows.open(label)} onClick={onToggle}>
        {market ? <AssetDisc asset={market.asset} className="lane-chip-mark" /> : null}
        <span className="ea-row-title">{label}</span>
        <span className="ea-row-sub numbers">{windows.quotes(view.quoteCount)}</span>
        <ChevronDown aria-hidden className="ea-row-chev" />
      </button>
      <span className="ea-row-inv">
        <InventoryBar yesRaw={view.yesRaw} noRaw={view.noRaw} />
      </span>
      <span className="ea-row-amt">
        {view.settled ? (
          <span className={cn("numbers ea-row-figure", view.realizedBase !== null && view.realizedBase > 0n && "ea-up", view.realizedBase !== null && view.realizedBase < 0n && "ea-down")}>{view.realizedBase === null ? "–" : signed2(view.realizedBase)}</span>
        ) : (
          <>
            <span className="numbers ea-row-figure">{money2(view.deployedBase)}</span>
            <CapMeter usedBase={view.deployedBase} capBase={capBase} />
          </>
        )}
      </span>
      <span className="ea-row-time">
        {view.settled ? (view.settledAtSec ? <UtcTime ms={view.settledAtSec * 1000} withSeconds={false} /> : null) : market && !act.expired ? <Countdown expirySec={market.expirySec} intervalSec={market.intervalSec} nowMs={nowMs} /> : null}
      </span>
      <span className="ea-row-act">
        {act.canSettle ? button("settle", onSettle) : act.canMerge ? button("merge", onMerge) : word ? <span className="ea-row-word">{word}</span> : null}
      </span>
      <div className={cn("ea-row-detail", expanded && "ea-row-detail--open")} inert={expanded ? undefined : true}>
        <div className="ea-row-detail-inner">
          <dl className="ea-book">
            <Tile k={windows.book.out} v={money2(view.escrowOutBase)} />
            <Tile k={windows.book.back} v={money2(view.escrowBackBase)} />
            <Tile k={windows.book.merged} v={money2(view.mergedBase)} />
            <Tile k={windows.book.paid} v={money2(view.payoutBase)} />
            <Tile k={windows.inventoryLabel} v={`${contracts(view.yesRaw)} / ${contracts(view.noRaw)}`} />
            <Tile k={windows.book.opened} v={view.openedAtSec ? <UtcTime ms={view.openedAtSec * 1000} withSeconds={false} /> : "–"} />
          </dl>
          {failed ? <TxFailureCard state={failed} onRetry={() => rowTx.dispatch({ type: "reset" })} /> : null}
        </div>
      </div>
    </li>
  );
}

function Tile({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="ea-tile">
      <dt className="ea-tile-k">{k}</dt>
      <dd className="ea-tile-v numbers">{v}</dd>
    </div>
  );
}
