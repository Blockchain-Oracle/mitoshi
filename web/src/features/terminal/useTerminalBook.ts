"use client";
// The terminal's book of positions (split from `TerminalScreen`, files ≤ 400 lines; D-227): each row reports what Close
// pays for it, and the totals (`totalsOf`: P&L and cost over priced rows, equity over every row), the chart's PnL pill,
// B/E, TP/SL and KO lines, Close all and the Window's own Close read them. Every position on the Window on screen is
// "active": the pill sums them, B/E is their combined break-even, Close closes each, Trail arms each. Open parlay tickets
// and Range rounds (`useTerminalBets`) report their fair value too: in Unrealized and equity, never in Close all.
import { useCallback, useMemo, useState } from "react";
import { SHELL } from "@/lib/copy";
import type { ChartLevel } from "./chart/LiveChart";
import { livePnlText } from "./format";
import { combinedSpotFor, trailEligible } from "./position-value";
import { sameValue, totalsOf, type Valued } from "./positions-totals";
import type { TerminalPosition } from "./terminal-positions";
import type { TerminalState } from "./useTerminalState";
import type { useTerminalClose } from "./useTerminalClose";
import type { PositionValue } from "./usePositionValue";
import { useTrailToggle } from "./useTrail";
import type { useTerminalBets } from "./parlay/useTerminalBets";

type Closer = ReturnType<typeof useTerminalClose>;

const sameBet = (a: Valued | undefined, b: Valued) => !!a && a.status === b.status && a.pnlBase === b.pnlBase && a.roiCostBase === b.roiCostBase && a.equityBase === b.equityBase;

export function useTerminalBook(s: TerminalState, closer: Closer, masked: boolean, trailPct: number, bets: ReturnType<typeof useTerminalBets>) {
  const [values, setValues] = useState<ReadonlyMap<string, PositionValue>>(() => new Map());
  const onValue = useCallback((id: string, v: PositionValue) => setValues((prev) => (sameValue(prev.get(id), v) ? prev : new Map(prev).set(id, v))), []);
  const [betValues, setBetValues] = useState<ReadonlyMap<string, Valued>>(() => new Map());
  const onBetValue = useCallback((id: string, v: Valued) => setBetValues((prev) => (sameBet(prev.get(id), v) ? prev : new Map(prev).set(id, v))), []);
  const totals = useMemo(() => totalsOf([...s.positions, ...bets.rows], new Map<string, Valued>([...values, ...betValues])), [s.positions, bets.rows, values, betValues]);
  const [closingAll, setClosingAll] = useState(false);
  const toggleTrail = useTrailToggle();
  const closeEach = async (rows: readonly TerminalPosition[]) => {
    for (const p of rows) await closer.close(p, values.get(p.id)?.exit ?? null);
  };
  const closeAll = async () => {
    setClosingAll(true);
    try {
      await closeEach(s.positions);
    } finally {
      setClosingAll(false);
    }
  };

  // The Window on screen: every position on it, the pill's P&L summed (each row in its own decimals), one B/E.
  const active = s.active;
  const activeValues = active.map((p) => values.get(p.id) ?? null);
  const lead = active[0] ?? null;
  const leadValue = activeValues[0] ?? null;
  const oneSide = active.every((p) => p.side === lead?.side);
  const pricedPnl = active.reduce<number | null>((sum, p, i) => {
    const v = activeValues[i];
    return v?.pnlBase == null ? sum : (sum ?? 0) + Number(v.pnlBase) / 10 ** p.decimals;
  }, null);
  const pnlBase = activeValues.reduce<bigint | null>((sum, v) => (v?.pnlBase == null ? sum : (sum ?? 0n) + v.pnlBase), null);
  const breakEven = active.length === 1 ? (leadValue?.breakEven ?? null) : lead && oneSide && activeValues.every((v) => v !== null) ? combinedSpotFor(activeValues.map((v) => v!.valueAt), active.reduce((sum, p) => sum + (p.costBase > 0n ? p.costBase : 0n), 0n), leadValue?.spot ?? null, lead.side) : null;
  if (lead) {
    const base = s.overlay.current ?? { pnl: null, pnlText: "", entry: null, levels: [] };
    const levels: ChartLevel[] = [
      ...base.levels,
      ...(breakEven === null ? [] : [{ kind: "breakeven" as const, price: breakEven, label: "B/E" }]),
      // Targets are a position's own: drawn when the Window holds one.
      ...(active.length === 1 && leadValue?.tpSpot != null ? [{ kind: "tp" as const, price: leadValue.tpSpot, label: "TP ≈" }] : []),
      ...(active.length === 1 && leadValue?.slSpot != null ? [{ kind: "sl" as const, price: leadValue.slSpot, label: "SL ≈" }] : []),
      ...activeValues.flatMap((v) => (v?.koSpot == null ? [] : [{ kind: "knockout" as const, price: v.koSpot, label: "KO ≈" }])),
    ];
    s.overlay.current = { ...base, levels, pnl: pricedPnl, pnlText: pnlBase === null ? "" : masked ? SHELL.masked : livePnlText(pnlBase) };
  }
  const spot = leadValue?.spot ?? null;
  const eligible = lead !== null && oneSide && trailEligible(lead.side, spot, breakEven, trailPct);
  const trailing = active.some((p) => p.trailStop !== null);
  const closeActive = async () => closeEach(active);
  // One tap for the Window: off for those trailing when any is, else on for each (each judged on its own B/E).
  const trailActive = () => active.forEach((p, i) => (p.trailStop !== null) === trailing && toggleTrail(p, activeValues[i] ?? null));

  return {
    values, onValue, onBetValue, totals, closingAll, closeAll,
    active: { rows: active, values: activeValues, lead, leadValue, eligible, trailing, busy: active.some((p) => closer.busy === p.id), locked: activeValues.length > 0 && activeValues.every((v) => v?.locked === true), close: closeActive, trail: trailActive },
  };
}
