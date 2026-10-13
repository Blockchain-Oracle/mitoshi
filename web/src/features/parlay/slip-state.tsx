"use client";
/**
 * The slip's composition, shared by the Windows list (adds legs) and the slip (rail or right-edge slide-over): legs,
 * the solve mode and the amount (Ported from Masayume 68f7a09:web/src/features/parlay/ParlayBuilder.tsx L41–L118, the
 * leg authoring and the lane-following effect). A leg names a Window and a side; when its Window leaves the live set
 * the leg moves to the next live Window of the same lane (a Window is a new id every round), skipping any Window
 * another leg holds, and says so. The same `prev` comes back when nothing changed, for the reference's own reason.
 */
import { PARLAY_MAX_LEGS, type MarketId, type Side } from "@cwf/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LegWindow } from "./data";

export interface DraftLeg {
  key: string;
  marketId: MarketId;
  side: Side;
  /** The lane the leg follows when its Window rolls (asset × cadence × lane basis). */
  laneKey: string;
  feed: string;
  /** Set when the leg moved to the lane's next Window; cleared on the next edit. */
  moved: boolean;
}

export type SolveMode = "fixStake" | "fixPayout";

export const laneKeyOf = (w: LegWindow) => `${w.market.asset}|${w.market.lane}|${w.market.intervalSec}`;

let seq = 0;
const newKey = () => `leg-${++seq}`;

interface SlipValue {
  legs: DraftLeg[];
  maxLegs: number;
  mode: SolveMode;
  amountText: string;
  add: (w: LegWindow, side: Side) => void;
  remove: (key: string) => void;
  setSide: (key: string, side: Side) => void;
  setWindow: (key: string, w: LegWindow) => void;
  setMode: (mode: SolveMode) => void;
  setAmountText: (text: string) => void;
  /** Replaces the slip with these Windows, all Up, at a $5 stake (Owarine's ⚡ close streak). */
  loadStreak: (picks: readonly LegWindow[]) => void;
  clear: () => void;
}

const SlipContext = createContext<SlipValue | null>(null);

export function useSlip(): SlipValue {
  const v = useContext(SlipContext);
  if (!v) throw new Error("useSlip outside SlipProvider");
  return v;
}

export function SlipProvider({ windows, maxLegs, initialLegs, onLegsChange, children }: { windows: readonly LegWindow[]; maxLegs: number; /** A slip the host kept across an unmount (the terminal's Parlay mode). */ initialLegs?: readonly DraftLeg[]; onLegsChange?: (legs: DraftLeg[]) => void; children: ReactNode }) {
  const [legs, setLegs] = useState<DraftLeg[]>(() => [...(initialLegs ?? [])]);
  useEffect(() => onLegsChange?.(legs), [legs, onLegsChange]);
  const [mode, setMode] = useState<SolveMode>("fixStake");
  const [amountText, setAmountText] = useState("5");
  const cap = Math.min(maxLegs, PARLAY_MAX_LEGS);

  const add = useCallback(
    (w: LegWindow, side: Side) => {
      const feed = w.model?.feed;
      if (!feed) return;
      setLegs((prev) => {
        const same = prev.find((l) => l.marketId === w.market.marketId);
        if (same) return prev.map((l) => (l.key === same.key ? { ...l, side, moved: false } : l));
        if (prev.length >= cap) return prev;
        return [...prev, { key: newKey(), marketId: w.market.marketId, side, laneKey: laneKeyOf(w), feed, moved: false }];
      });
    },
    [cap],
  );
  const remove = useCallback((key: string) => setLegs((prev) => prev.filter((l) => l.key !== key)), []);
  const setSide = useCallback((key: string, side: Side) => setLegs((prev) => prev.map((l) => (l.key === key ? { ...l, side, moved: false } : l))), []);
  const setWindow = useCallback(
    (key: string, w: LegWindow) => setLegs((prev) => (prev.some((l) => l.key !== key && l.marketId === w.market.marketId) ? prev : prev.map((l) => (l.key === key ? { ...l, marketId: w.market.marketId, moved: false } : l)))),
    [],
  );
  const clear = useCallback(() => setLegs([]), []);
  // Ported from Owarine 90a91d71:web/src/features/parlay/ParlayBuilder.tsx `loadStreakPreset` (R4-5, D-227).
  const loadStreak = useCallback(
    (picks: readonly LegWindow[]) => {
      const legsOf = picks.slice(0, cap).flatMap((w) => (w.model?.feed ? [{ key: newKey(), marketId: w.market.marketId, side: "up" as const, laneKey: laneKeyOf(w), feed: w.model.feed, moved: false }] : []));
      if (legsOf.length < 2) return;
      setLegs(legsOf);
      setMode("fixStake");
      setAmountText("5");
    },
    [cap],
  );

  useEffect(() => {
    const live = new Set(windows.map((w) => w.market.marketId));
    setLegs((prev) => {
      let changed = false;
      const used = new Set(prev.map((l) => l.marketId));
      const next = prev.map((leg) => {
        if (live.has(leg.marketId)) return leg;
        const successor = windows.find((w) => laneKeyOf(w) === leg.laneKey && w.model !== null && !used.has(w.market.marketId));
        if (!successor) return leg;
        used.add(successor.market.marketId);
        changed = true;
        return { ...leg, marketId: successor.market.marketId, moved: true };
      });
      return changed ? next : prev;
    });
  }, [windows]);

  const value = useMemo(() => ({ legs, maxLegs: cap, mode, amountText, add, remove, setSide, setWindow, setMode, setAmountText, loadStreak, clear }), [legs, cap, mode, amountText, add, remove, setSide, setWindow, loadStreak, clear]);
  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}
