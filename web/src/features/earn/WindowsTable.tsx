"use client";
/**
 * §02 on the maker tab (Owarine 90a91d71 `features/earn/WindowsTable.tsx`): one row per Window the maker is on, then
 * the last settled ones — deployed capital, what the vault holds, the state and the result, each the contract's own.
 * Merge and settle are permissionless and sponsored: anyone signed in may send them. D-226: the total deployed leads;
 * from 768 px it is the table, below that one card per Window (Owarine's `.bets-row` two-line pattern) — the table no
 * longer runs off a phone.
 */
import { formatBaseUnits, formatCadence, type MarketId } from "@cwf/core";
import type { MakerWindowRow } from "@cwf/markets/maker";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
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

/** One Window's figures, read once for both layouts. */
function rowModel(row: MakerWindowRow, nowMs: number) {
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
  return {
    asset: market?.asset ?? null,
    label: market ? `${market.asset} ${formatCadence(market.intervalSec)}` : windows.reading,
    quotes: windows.quotes(view.quoteCount),
    deployed: money2(view.deployedBase),
    holding: `${contracts(view.yesRaw)} / ${contracts(view.noRaw)}`,
    state,
    result: view.realizedBase === null ? "–" : `${view.realizedBase < 0n ? "−" : "+"}${money2(view.realizedBase)}`,
    canMerge: !view.settled && pairs > 0n,
    canSettle: !view.settled && settleable,
  };
}

function Actions({ row, busyRow, canSign, onMerge, onSettle }: { row: MakerWindowRow } & Pick<WindowsTableProps, "busyRow" | "canSign" | "onMerge" | "onSettle">) {
  const { windows } = EARN;
  const m = rowModel(row, 0);
  const id = row.view.marketId;
  if (!canSign) return null;
  return (
    <>
      {m.canMerge ? (
        <button type="button" onClick={() => onMerge(id)} disabled={busyRow !== null} className="pl-settle ea-row-btn">
          {busyRow === `merge:${id}` ? windows.busy : windows.merge}
        </button>
      ) : null}
      {m.canSettle ? (
        <button type="button" onClick={() => onSettle(id)} disabled={busyRow !== null} className="pl-settle ea-row-btn">
          {busyRow === `settle:${id}` ? windows.busy : windows.settle}
        </button>
      ) : null}
    </>
  );
}

export function WindowsTable(props: WindowsTableProps) {
  const { windows } = EARN;
  const rows = [...props.open, ...props.history];
  if (rows.length === 0) return <div className="pl-slip-empty">{windows.empty}</div>;
  const deployedBase = props.open.reduce((sum, r) => sum + r.view.deployedBase, 0n);
  const actions = { busyRow: props.busyRow, canSign: props.canSign, onMerge: props.onMerge, onSettle: props.onSettle };
  return (
    <div className="ea-capital">
      <p className="ea-capital-total">
        <span className="numbers">{money2(deployedBase)}</span> {windows.total(props.open.length)}
      </p>

      <ul className="ea-wcards" aria-label={EARN.sections.windows.title}>
        {rows.map((row) => {
          const m = rowModel(row, props.nowMs);
          return (
            <li key={`${row.view.marketId}:${row.view.settled ? "s" : "o"}`} className="ea-wcard">
              <div className="ea-wcard-head">
                {m.asset ? <AssetDisc asset={m.asset} className="lane-chip-mark" /> : null}
                <span className="ea-wcard-name">{m.label}</span>
                <span className="ea-wcard-state">{m.state}</span>
              </div>
              <dl className="ea-wcard-figs">
                <div><dt>{windows.deployed}</dt><dd className="numbers">{m.deployed}</dd></div>
                <div><dt>{windows.inventory}</dt><dd className="numbers">{m.holding}</dd></div>
                <div><dt>{windows.result}</dt><dd className="numbers">{m.result}</dd></div>
              </dl>
              <div className="ea-wcard-foot">
                <span className="ea-td-sub">{m.quotes}</span>
                <span className="ea-wcard-actions"><Actions row={row} {...actions} /></span>
              </div>
            </li>
          );
        })}
      </ul>

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
            {rows.map((row) => {
              const m = rowModel(row, props.nowMs);
              return (
                <tr key={`${row.view.marketId}:${row.view.settled ? "s" : "o"}`}>
                  <td className="ea-td">
                    <span className="inline-flex items-center gap-2">
                      {m.asset ? <AssetDisc asset={m.asset} className="lane-chip-mark" /> : null}
                      {m.label}
                    </span>
                    <span className="ea-td-sub"> · {m.quotes}</span>
                  </td>
                  <td className="ea-td ea-td--num numbers">{m.deployed}</td>
                  <td className="ea-td ea-td--num numbers">{m.holding}</td>
                  <td className="ea-td">
                    {m.state}
                    <Actions row={row} {...actions} />
                  </td>
                  <td className="ea-td ea-td--num numbers">{m.result}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
