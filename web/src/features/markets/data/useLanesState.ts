"use client";
/**
 * The lane rail's state (Ported from Masayume 68f7a09:web/src/features/markets/lanes/useLanes.ts with Agari
 * 03b30ab's (basis, cadence) keys and ticker pin): the pinned lane stays selected while it has no live Window
 * ("between rounds", never a silent jump); the ticker pin narrows every lane to one asset.
 */
import type { Lane, LaneSet, Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, useLanes } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useMemo } from "react";
import { useClockValue } from "@/lib/clock";
import { usePersistedState } from "@/lib/persisted";
import { boardLanes, laneKeyOf, laneTabParts, parseLaneTabKey, type LaneTabKey } from "./lane-view";

/** v2 (D-226): the board's 24/7 lanes merged and lead; a pin stored before then would hold a visitor on a stock lane. */
const LANE_KEY = "cwf.lane.v2";
const TICKER_KEY = "cwf.ticker";
const NONE = "";

/** A 24/7 stock pin is the merged 24/7 lane of its cadence (`boardLanes` keys it as the crypto lane). */
const laneCodec = { parse: (raw: string) => (raw === NONE ? NONE : parseLaneTabKey(raw.replace(/^stock24:/, "crypto24:"))), serialize: (v: LaneTabKey | typeof NONE) => v };
const tickerCodec = { parse: (raw: string) => (/^[A-Z]{1,6}$/.test(raw) || raw === NONE ? raw : null), serialize: (v: string) => v };

export interface LanesState {
  reading: Reading<LaneSet> | null;
  laneSet: LaneSet | null;
  activeLane: Lane | null;
  activeKey: LaneTabKey | null;
  activeIntervalSec: number | null;
  pinnedMissing: boolean;
  pin: (key: LaneTabKey) => void;
  ticker: string | null;
  pinTicker: (ticker: string | null) => void;
  retry: () => void;
}

export function useLanesState(): LanesState {
  // Deferred (D-184): a new lane list re-renders the page in the background, time-sliced — the hero, ~8 lane cards and
  // ~50 word-board cards at once was the page's longest task (~250 ms at 4× CPU) on arrival and on every refetch.
  const raw = useDeferredValue(useLanes());
  // The board's reading carries the merged lanes, so every reader of `reading` and `laneSet` sees one board.
  const reading = useMemo<Reading<LaneSet> | null>(() => (raw && isOk(raw) ? { ...raw, value: boardLanes(raw.value) } : raw), [raw]);
  const laneSet = reading && isOk(reading) ? reading.value : null;
  const [pinned, pin] = usePersistedState<LaneTabKey | typeof NONE>(LANE_KEY, NONE, laneCodec);
  const [tickerRaw, setTicker] = usePersistedState<string>(TICKER_KEY, NONE, tickerCodec);
  const queryClient = useQueryClient();
  const retry = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.lanes() }), [queryClient]);
  const pinTicker = useCallback((t: string | null) => setTicker(t ?? NONE), [setTicker]);

  const lanes = laneSet?.lanes ?? [];
  const pinnedKey = pinned === NONE ? null : pinned;
  const pinnedLane = pinnedKey === null ? null : (lanes.find((lane) => laneKeyOf(lane) === pinnedKey) ?? null);
  const pinnedMissing = pinnedKey !== null && laneSet !== null && pinnedLane === null;
  // Unpinned, the board opens on a lane trading now — the 5m 24/7 lane, coins first, since the 24/7 lanes lead (D-226):
  // off-hours the Regular lanes list only tomorrow's Windows, and Markets is every market, not the stocks'.
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  const tradingNow = (lane: Lane) => lane.markets.some((m) => m.tradingStartSec <= minute * 60 && minute * 60 < m.lockAtSec);
  const activeLane = pinnedLane ?? (pinnedMissing ? null : (lanes.find(tradingNow) ?? lanes[0] ?? null));
  const activeKey = pinnedMissing ? pinnedKey : activeLane ? laneKeyOf(activeLane) : null;

  return {
    reading,
    laneSet,
    activeLane,
    activeKey,
    activeIntervalSec: activeKey ? laneTabParts(activeKey).intervalSec : null,
    pinnedMissing,
    pin,
    ticker: tickerRaw === NONE ? null : tickerRaw,
    pinTicker,
    retry,
  };
}
