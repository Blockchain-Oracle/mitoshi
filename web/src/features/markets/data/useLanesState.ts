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
import { useCallback } from "react";
import { usePersistedState } from "@/lib/persisted";
import { laneKeyOf, laneTabParts, parseLaneTabKey, type LaneTabKey } from "./lane-view";

const LANE_KEY = "cwf.lane";
const TICKER_KEY = "cwf.ticker";
const NONE = "";

const laneCodec = { parse: (raw: string) => (raw === NONE ? NONE : parseLaneTabKey(raw)), serialize: (v: LaneTabKey | typeof NONE) => v };
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
  const reading = useLanes();
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
  const activeLane = pinnedLane ?? (pinnedMissing ? null : (lanes[0] ?? null));
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
