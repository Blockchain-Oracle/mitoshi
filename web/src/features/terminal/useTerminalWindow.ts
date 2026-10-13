"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/useTerminalWindow.ts — on Mitoshi's `useLanes` and the
// markets page's deep-link rules (a settled Window resolves to its successor with a note, L-21), addressed by the
// terminal's own `?lane=` and `?w=` (D-192).
import { isMarketId, isOk, type EventMarket, type LaneSet, type MarketId } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { useLanes, useMarket, useNextWindow } from "@cwf/markets/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { findMarket } from "@/features/markets/data/useSelection";
import { parseLaneTabKey, type LaneTabKey } from "@/features/markets/data/lane-view";
import { MARKETS } from "@/features/markets/copy";
import { useClockValue } from "@/lib/clock";
import { notify } from "@/lib/toast";
import { defaultLane, laneMarkets, lanesFor, pickWindow, type TerminalLane } from "./pick-window";

export const LANE_PARAM = "lane";
export const WINDOW_PARAM = "w";
/** `?mode=`: the terminal's mode (R4-13a, D-227) — More's "Short" opens `?mode=boost&pick=down`. */
export const MODE_PARAM = "mode";

export interface TerminalWindow {
  set: LaneSet | null;
  lanes: TerminalLane[];
  lane: TerminalLane | null;
  /** The Window on screen: `?w=` (or its successor), else the lane's pick; null when the symbol lists none. */
  market: EventMarket | null;
  /** `?w=` names a Window on another ticker (a `/markets/<id>` link): the screen moves there. */
  linkedAsset: string | null;
  loading: boolean;
  failure: string | null;
}

/**
 * Writes the address without a navigation (Tradash: market and Window switches never remount the screen). The entry's
 * own state goes along without Next's marker (`__NA`): with it, Next takes the write for its own and `useSearchParams`
 * never hears the new lane (R4-0, D-227: a lane chip changed the URL and nothing else).
 */
export function replaceTradeParams(next: { lane?: LaneTabKey | null; w?: MarketId | null; mode?: string | null }): void {
  const url = new URL(window.location.href);
  for (const [k, v] of [[LANE_PARAM, next.lane], [WINDOW_PARAM, next.w], [MODE_PARAM, next.mode]] as const) {
    if (v === undefined) continue;
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  const { __NA: _na, _N: _n, ...state } = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.replaceState(state, "", url);
}

/** `?w=`: the linked Window, or — settled — its successor, said once; a gone one falls back to the lane's pick. */
function useLinkedWindow(set: LaneSet | null, raw: string | null): { market: EventMarket | null; resolving: boolean } {
  const linked = raw && isMarketId(raw.toLowerCase()) ? (raw.toLowerCase() as MarketId) : null;
  const live = findMarket(set, linked);
  const lookup = linked !== null && set !== null && live === null;
  const fetched = useMarket(lookup ? linked : null);
  const fetchedMarket = lookup && fetched && isOk(fetched) ? fetched.value : null;
  const dead = fetchedMarket && (fetchedMarket.state !== "open" || fetchedMarket.lockAtSec * 1000 <= Date.now()) ? fetchedMarket : null;
  const successor = useNextWindow(dead);
  const next = dead && successor && isOk(successor) ? successor.value : null;
  const gone = (lookup && fetched !== null && isOk(fetched) && fetched.value === null) || (dead !== null && successor !== null && isOk(successor) && successor.value === null);
  const said = useRef<string | null>(null);
  useEffect(() => {
    const key = next ? `s:${dead?.marketId}` : gone ? `g:${linked}` : null;
    if (!key || said.current === key) return;
    said.current = key;
    notify.neutral(next ? MARKETS.notes.successor(formatCadence(next.intervalSec)) : MARKETS.notes.gone);
    replaceTradeParams({ w: next ? next.marketId : null });
  }, [next, gone, dead, linked]);
  if (live) return { market: live, resolving: false };
  if (next) return { market: next, resolving: false };
  if (fetchedMarket && !dead) return { market: fetchedMarket, resolving: false };
  return { market: null, resolving: linked !== null && !gone && (set === null || fetched === null || (dead !== null && successor === null)) };
}

export function useTerminalWindow(asset: string): TerminalWindow {
  const reading = useLanes();
  const set = reading && reading.ok ? reading.value : null;
  const params = useSearchParams();
  const asked = parseLaneTabKey(params.get(LANE_PARAM) ?? "");
  // The pick only changes when a Window starts, enters its last 30 s or ends: re-derive on the second, render on change.
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  const linked = useLinkedWindow(set, params.get(WINDOW_PARAM));
  return useMemo(() => {
    const lanes = lanesFor(set, asset, nowSec);
    const linkedMarket = linked.market && linked.market.asset === asset ? linked.market : null;
    const lane = linkedMarket ? (lanes.find((l) => l.basis === linkedMarket.lane && l.intervalSec === linkedMarket.intervalSec) ?? null) : defaultLane(set, asset, nowSec, asked);
    const market = linkedMarket ?? (lane ? pickWindow(laneMarkets(set, lane.key, asset), nowSec) : null);
    return {
      set, lanes, lane, market,
      linkedAsset: linked.market && linked.market.asset !== asset ? linked.market.asset : null,
      loading: reading === null || linked.resolving,
      failure: reading && !reading.ok ? reading.error.technical : null,
    };
  }, [set, asset, nowSec, asked, linked.market, linked.resolving, reading]);
}
