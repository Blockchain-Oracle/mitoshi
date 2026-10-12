// Ported from Owarine 90a91d71:web/src/features/terminal/ui/PositionsPanel.tsx (`totalsOf`) — D-227: the Unrealized
// figure, its %, the View-position pill and the PnL card's ROI sum P&L and cost over priced rows only (a row with no
// exit to price it is counted apart, never as 0 against its full cost); equity sums every row's `equityBase` (the part
// the book takes at its value, the rest at cost, a settled Window at its payout). Integers throughout.
import { isPriced } from "./position-return";
import type { TerminalPosition } from "./terminal-positions";
import type { PositionValue } from "./usePositionValue";

export interface PositionsTotals {
  /** P&L of the priced rows; null when none is priced. */
  pnlBase: bigint | null;
  /** What those rows' P&L is taken against (ROI's denominator). */
  costBase: bigint;
  /** Rows with no number yet (locked, no bids, updating, reading): left out of `pnlBase`. */
  unpriced: number;
  /** What every row counts for in equity. */
  equityBase: bigint;
  /** What sales on the open Windows already realised (each Window once), and the cost those sales took out. */
  realizedBase: bigint;
  realizedCostBase: bigint;
}

/** A value a priced figure can be read from (the totals, and anything else summing rows: the parlay and range rows too). */
export type Valued = Pick<PositionValue, "status" | "pnlBase" | "roiCostBase" | "equityBase">;

export function totalsOf(positions: readonly Pick<TerminalPosition, "id" | "costBase" | "realizedBase" | "realizedCostBase">[], values: ReadonlyMap<string, Valued>): PositionsTotals {
  let pnl = 0n;
  let cost = 0n;
  let priced = 0;
  let unpriced = 0;
  let equity = 0n;
  let realized = 0n;
  let realizedCost = 0n;
  for (const p of positions) {
    realized += p.realizedBase;
    realizedCost += p.realizedCostBase ?? 0n;
    const v = values.get(p.id);
    equity += v ? v.equityBase : p.costBase > 0n ? p.costBase : 0n;
    if (v && isPriced(v.status) && v.pnlBase !== null && v.roiCostBase !== null) {
      pnl += v.pnlBase;
      cost += v.roiCostBase;
      priced += 1;
    } else unpriced += 1;
  }
  return { pnlBase: priced > 0 ? pnl : null, costBase: cost, unpriced, equityBase: equity, realizedBase: realized, realizedCostBase: realizedCost };
}

/** ROI in basis points over what the priced rows cost; null with no cost. */
export const roiBpsOf = (pnlBase: bigint | null, costBase: bigint): number | null => (pnlBase !== null && costBase > 0n ? Number((pnlBase * 10_000n) / costBase) : null);

/** Every field a consumer reads (the model closures ride with the inputs these carry), so a cached row never lags. */
export function sameValue(a: PositionValue | undefined, b: PositionValue): boolean {
  if (!a) return false;
  return (
    a.exit === b.exit && a.status === b.status && a.valueBase === b.valueBase && a.pnlBase === b.pnlBase && a.roiBps === b.roiBps && a.costShareBase === b.costShareBase &&
    a.roiCostBase === b.roiCostBase && a.equityBase === b.equityBase && a.triggerValueBase === b.triggerValueBase && a.nowTicks === b.nowTicks && a.fillablePct === b.fillablePct &&
    a.approx === b.approx && a.locked === b.locked && a.partial === b.partial && a.spot === b.spot && a.breakEven === b.breakEven && a.tpSpot === b.tpSpot && a.slSpot === b.slSpot &&
    a.koSpot === b.koSpot && a.settled === b.settled
  );
}
