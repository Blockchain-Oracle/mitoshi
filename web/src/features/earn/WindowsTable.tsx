"use client";
/**
 * §02 on the maker tab (Owarine 90a91d71 `features/earn/WindowsTable.tsx`): one row per Window the maker is on, then
 * the last settled ones — deployed capital, what the vault holds, the state and the result, each the contract's own.
 * Merge and settle are permissionless and sponsored: anyone signed in may send them.
 */
import { formatBaseUnits, formatCadence, type MarketId } from "@cwf/core";
import type { MakerWindowRow } from "@cwf/markets/maker";
import type { RowAction } from "./useEarnWrites";
import { EARN } from "./copy";
import { DECIMALS, money2 } from "./format";

interface WindowsTableProps {
  open: MakerWindowRow[];
  history: MakerWindowRow[];
  nowMs: number;
  busyRow: RowAction | null;
  canSign: boolean;
  onMerge: (marketId: MarketId) => void;
  onSettle: (marketId: MarketId) => void;
}

const contracts = (raw: bigint) => formatBaseUnits(raw, DECIMALS, { minDp: 0, maxDp: 2 });

function Row({ row, nowMs, busyRow, canSign, onMerge, onSettle }: { row: MakerWindowRow } & Omit<WindowsTableProps, "open" | "history">) {
  const { windows } = EARN;
  const { view, market, settleable } = row;
  const closed = market !== null && nowMs > 0 && market.expirySec * 1000 <= nowMs;
  const pairs = view.yesRaw < view.noRaw ? view.yesRaw : view.noRaw;
  let state: string;
  if (view.settled) state = windows.settled;
  else if (settleable) state = windows.closed;
  else if (closed) state = windows.printPending;
  else if (pairs > 0n) state = windows.paired(contracts(pairs));
  else if (view.yesRaw > 0n || view.noRaw > 0n) state = windows.oneSided(view.yesRaw > 0n ? "UP" : "DOWN", contracts(view.yesRaw > 0n ? view.yesRaw : view.noRaw));
  else state = windows.resting;
  const mergeBusy = busyRow === `merge:${view.marketId}`;
  const settleBusy = busyRow === `settle:${view.marketId}`;
  return (
    <tr>
      <td className="ea-td">
        {market ? `${market.asset} ${formatCadence(market.intervalSec)}` : windows.reading}
        <span className="ea-td-sub"> · {windows.quotes(view.quoteCount)}</span>
      </td>
      <td className="ea-td ea-td--num numbers">{money2(view.deployedBase)}</td>
      <td className="ea-td ea-td--num numbers">
        {contracts(view.yesRaw)} / {contracts(view.noRaw)}
      </td>
      <td className="ea-td">
        {state}
        {canSign && !view.settled && pairs > 0n ? (
          <button type="button" onClick={() => onMerge(view.marketId)} disabled={busyRow !== null} className="pl-settle ea-row-btn">
            {mergeBusy ? windows.busy : windows.merge}
          </button>
        ) : null}
        {canSign && !view.settled && settleable ? (
          <button type="button" onClick={() => onSettle(view.marketId)} disabled={busyRow !== null} className="pl-settle ea-row-btn">
            {settleBusy ? windows.busy : windows.settle}
          </button>
        ) : null}
      </td>
      <td className="ea-td ea-td--num numbers">{view.realizedBase === null ? "–" : `${view.realizedBase < 0n ? "−" : "+"}${money2(view.realizedBase)}`}</td>
    </tr>
  );
}

export function WindowsTable(props: WindowsTableProps) {
  const { windows } = EARN;
  const rows = [...props.open, ...props.history];
  if (rows.length === 0) return <div className="pl-slip-empty">{windows.empty}</div>;
  return (
    <div className="ea-table-wrap">
      <table className="ea-table">
        <thead>
          <tr>
            <th className="ea-th">{windows.window}</th>
            <th className="ea-th ea-td--num">{windows.deployed}</th>
            <th className="ea-th ea-td--num">{windows.inventory} UP / DOWN</th>
            <th className="ea-th">{windows.state}</th>
            <th className="ea-th ea-td--num">{windows.result}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={`${row.view.marketId}:${row.view.settled ? "s" : "o"}`} row={row} nowMs={props.nowMs} busyRow={props.busyRow} canSign={props.canSign} onMerge={props.onMerge} onSettle={props.onSettle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
