"use client";
/**
 * What the hero and the ticket render from (Ported from Masayume 68f7a09:web/src/features/markets/useMarketsSelection.ts
 * + lib/deep-link.ts): the URL is the source of truth (`/markets?m=&dir=` or `/markets/<id>`), so a share link
 * reproduces it; a dead Window resolves to its successor with a one-line note, a gone one falls back to the lanes
 * (UX-DR21). Unlike the reference, no clock is read here — the leaves tick (ux-audit fix 12); a dead link is judged by
 * the Window's own close against the chain clock at the moment it is resolved.
 */
import type { EventMarket, LaneSet, MarketId, Side } from "@cwf/core";
import { isOk } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { marketDeepLink, parseMarketsSearch } from "@cwf/core/urls";
import { useMarket, useNextWindow } from "@cwf/markets/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { nowMs as clockNowMs } from "@/lib/clock";
import { NOTE_KIND, NOTE_PARAM } from "@/lib/routes";
import { notify } from "@/lib/toast";
import { MARKETS } from "../copy";

/** Tailwind `lg` — from here up the ticket is the hero's rail; below it, the right-edge slide-over. */
export const TICKET_RAIL_MIN_WIDTH = 1024;

export interface MarketsSelection {
  marketId: MarketId | null;
  side: Side | null;
  market: EventMarket | null;
  resolving: boolean;
  /** Bumped on every tap that opens the ticket (the reference's `sessionId`): the URL alone can't say "open it again". */
  sessionId: number;
}

export function findMarket(lanes: LaneSet | null, marketId: MarketId | null): EventMarket | null {
  if (!lanes || !marketId) return null;
  for (const lane of lanes.lanes) {
    const hit = lane.markets.find((m) => m.marketId === marketId);
    if (hit) return hit;
  }
  return null;
}

function useNoteOnce(key: string | null, text: string | null) {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (!key || !text || fired.current === key) return;
    fired.current = key;
    notify.neutral(text);
  }, [key, text]);
}

function useResolveDeepLink(lanes: LaneSet | null, routeMarketId: MarketId | null) {
  const params = useSearchParams();
  const search = parseMarketsSearch(params);
  const linked = search.marketId ?? routeMarketId;
  const dir = search.dir;
  const live = findMarket(lanes, linked);
  const needsLookup = linked !== null && lanes !== null && live === null;
  const fetched = useMarket(needsLookup ? linked : null);
  const fetchedMarket = needsLookup && fetched && isOk(fetched) ? fetched.value : null;
  const dead = fetchedMarket && (fetchedMarket.state !== "open" || fetchedMarket.lockAtSec * 1000 <= clockNowMs()) ? fetchedMarket : null;
  const successor = useNextWindow(dead);
  const successorMarket = dead && successor && isOk(successor) ? successor.value : null;
  const gone = needsLookup && fetched !== null && isOk(fetched) && fetched.value === null;
  const noSuccessor = dead !== null && successor !== null && isOk(successor) && successor.value === null;

  const note =
    params.get(NOTE_PARAM) === NOTE_KIND.moved
      ? { key: "moved", text: MARKETS.notes.moved }
      : successorMarket
        ? { key: `successor:${dead?.marketId}`, text: MARKETS.notes.successor(formatCadence(successorMarket.intervalSec)) }
        : gone || noSuccessor
          ? { key: `gone:${linked}`, text: MARKETS.notes.gone }
          : null;
  useNoteOnce(note?.key ?? null, note?.text ?? null);

  useEffect(() => {
    if (successorMarket) window.history.replaceState(null, "", marketDeepLink({ marketId: successorMarket.marketId, dir: dir ?? undefined }));
  }, [successorMarket, dir]);

  if (live) return { marketId: live.marketId, side: dir, market: live, resolving: false };
  if (successorMarket) return { marketId: successorMarket.marketId, side: dir, market: successorMarket, resolving: false };
  if (fetchedMarket && !dead) return { marketId: fetchedMarket.marketId, side: dir, market: fetchedMarket, resolving: false };
  const resolving = linked !== null && !gone && !noSuccessor && (lanes === null || fetched === null || (dead !== null && successor === null));
  return { marketId: null, side: dir, market: null, resolving };
}

/** Deep link → the pinned lane's (and ticker's) soonest Window → the first live Window. */
export function useMarketsSelection(lanes: LaneSet | null, fallback: EventMarket | null, routeMarketId: MarketId | null) {
  const resolved = useResolveDeepLink(lanes, routeMarketId);
  const [sessionId, setSessionId] = useState(0);
  const market = resolved.market ?? findMarket(lanes, resolved.marketId) ?? (resolved.resolving ? null : fallback);

  const setSelection = useCallback(
    (marketId: MarketId, side?: Side) => {
      const dir = side ?? resolved.side ?? undefined;
      window.history.replaceState(null, "", marketDeepLink({ marketId, dir }));
      setSessionId(Date.now());
      // On desktop the call lives in the hero at the top: bring the page there (the reference's `openTicket`).
      if (window.innerWidth >= TICKET_RAIL_MIN_WIDTH) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [resolved.side],
  );

  const selection: MarketsSelection = { marketId: market?.marketId ?? null, side: resolved.side, market, resolving: resolved.resolving, sessionId };
  return { selection, setSelection };
}
