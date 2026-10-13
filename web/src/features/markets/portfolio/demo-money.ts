// /portfolio signed out (R6 money, S07 + T02; D-230): DEMO's paper state as the money card reads it. DEMO's balance
// moves by realised P&L only — a paper call never takes its cost at open (`terminal/demo.ts`) — so what is free is the
// balance less every open row's cost, what is open is what Close pays now (the terminal's paper valuation, the same
// `usePositionValue` engine), and the figure is their sum: the balance plus unrealised P&L. Pure; base units.
import type { Money } from "./useMoney";

export interface PaperRow {
  id: string;
  costBase: bigint;
}

/** The part of a row's value the figure needs (`PositionValue`). */
export interface PaperValue {
  equityBase: bigint;
}

export interface DemoMoney {
  money: Money;
  /** The balance less the open rows' cost. */
  freeBase: bigint;
  /** What Close pays now across the open rows (each at cost until it has a value). */
  openBase: bigint;
  /** Σ settled paper P&L. */
  realisedBase: bigint;
  settledCount: number;
}

export const PAPER_DECIMALS = 6;

export function demoMoney(demo: { balanceBase: bigint; history: readonly { pnlBase: string }[] }, rows: readonly PaperRow[], values: ReadonlyMap<string, PaperValue>): DemoMoney {
  let cost = 0n;
  let open = 0n;
  let valued = 0;
  for (const r of rows) {
    cost += r.costBase;
    const v = values.get(r.id);
    if (v) valued += 1;
    open += v ? v.equityBase : r.costBase;
  }
  const freeBase = demo.balanceBase - cost;
  const realisedBase = demo.history.reduce((sum, t) => sum + BigInt(t.pnlBase), 0n);
  const ready = valued === rows.length;
  const money: Money = {
    decimals: PAPER_DECIMALS,
    walletBase: freeBase,
    tradingBase: 0n,
    positionsBase: open,
    collectBase: 0n,
    totalBase: freeBase + open,
    readyBase: freeBase,
    pools: [],
    pockets: [],
    openCount: rows.length,
    boostOwedBase: 0n,
    ready,
  };
  return { money, freeBase, openBase: open, realisedBase, settledCount: demo.history.length };
}
