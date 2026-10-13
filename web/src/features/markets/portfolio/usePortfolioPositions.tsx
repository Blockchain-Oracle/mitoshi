"use client";
// /portfolio on the terminal's value engine (D-227): every position the account holds — the wallet's, the Trading
// Balance's and the Boosts', one row per held side (`useTerminalPositions`) — each valued by the same hook as the
// terminal's rows (`usePositionValue`: what Close pays now, the rest at cost), so the two pages show one P&L. The
// valuers render nothing; they report into one map, which the money card's positions leg (Σ equity) and the rows read.
import type { Address } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sameValue, totalsOf } from "@/features/terminal/positions-totals";
import { useTerminalPositions, type TerminalPosition } from "@/features/terminal/terminal-positions";
import { usePositionValue, type PositionValue } from "@/features/terminal/usePositionValue";

/** One Window in one home: a side, or both (a hedge reads "UP + DOWN" with its legs summed); a Boost is its own row. */
export interface BetGroup {
  key: string;
  legs: TerminalPosition[];
}

export function groupBets(positions: readonly TerminalPosition[]): BetGroup[] {
  const groups = new Map<string, TerminalPosition[]>();
  for (const p of positions) {
    const key = p.via === "boost" ? p.id : `${p.via}:${p.vault ?? ""}:${p.marketId}`.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups].map(([key, legs]) => ({ key, legs }));
}

/** `null` signed out: DEMO's paper positions (R6 money, S07), valued by the same engine. */
export function usePortfolioPositions(wallet: Address | null) {
  const lanes = useLanes();
  const positions = useTerminalPositions(wallet, lanes?.ok ? lanes.value : null);
  const [values, setValues] = useState<ReadonlyMap<string, PositionValue>>(() => new Map());
  const onValue = useCallback((id: string, v: PositionValue) => setValues((prev) => (sameValue(prev.get(id), v) ? prev : new Map(prev).set(id, v))), []);
  const totals = useMemo(() => totalsOf(positions, values), [positions, values]);
  const groups = useMemo(() => groupBets(positions), [positions]);
  return { positions, values, onValue, totals, groups };
}

function Valuer({ p, onValue }: { p: TerminalPosition; onValue: (id: string, v: PositionValue) => void }) {
  const v = usePositionValue(p);
  useEffect(() => onValue(p.id, v), [p.id, v, onValue]);
  return null;
}

/** Every position's live value, whatever page of the list is showing. */
export function PositionValuers({ positions, onValue }: { positions: readonly TerminalPosition[]; onValue: (id: string, v: PositionValue) => void }) {
  return (
    <>
      {positions.map((p) => (
        <Valuer key={p.id} p={p} onValue={onValue} />
      ))}
    </>
  );
}
