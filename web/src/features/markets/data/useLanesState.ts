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
import { useCallback, useDeferredValue } from "react";
import { useClockValue } from "@/lib/clock";
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
  // Deferred (D-184): a new lane list re-renders the page in the background, time-sliced — the hero, ~8 lane cards and
  // ~50 word-board cards at once was the page's longest task (~250 ms at 4× CPU) on arrival and on every refetch.
  const reading = useDeferredValue(useLanes());
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
  // Unpinned, the board opens on a lane trading now (Owarine 90a91d71 sorts lanes soonest first; O-2): off-hours the
  // Regular lanes list only tomorrow's Windows, so leading with them showed a board of "opens 14:30" and no prices.
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
