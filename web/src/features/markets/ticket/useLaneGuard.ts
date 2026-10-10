"use client";
// Ported from Agari 03b30ab:web/src/features/markets/ticket/useLaneGuard.ts — on the stream-fed session (S6); the
// earnings line moves to its own note (`useEarningsNote`), and `when` is bound at the top of the hook.
import { haltLabel, isTickerSymbol, type EventMarket } from "@cwf/core";
import type { BlockerContext } from "@cwf/core/copy";
import { laneHaltAsset, laneState, useMarketSession } from "@/features/markets/session";
import { useWhen } from "@/lib/when";
import type { LaneGuardInput } from "./ticket-guards";

export interface LaneGuard {
  /** Null while the session is unknown (or the asset isn't listed): nothing is claimed about the hours. */
  lane: LaneGuardInput | null;
  /** `opensText` for `session-closed`, `haltStale` for `halted`. */
  ctx: Pick<BlockerContext, "opensText" | "haltStale">;
}

/** The ticket's session-lane inputs for its Window: the halt on its asset, its lane's roller state, the hours. */
export function useLaneGuard(market: EventMarket): LaneGuard {
  const asset = isTickerSymbol(market.asset) ? market.asset : null;
  const session = useMarketSession(asset ? laneHaltAsset(asset, market.lane) : undefined);
  const when = useWhen();
  if (!session || !asset) return { lane: null, ctx: {} };
  const halt = session.halt;
  const nextOpenSec = session.status.nextOpenSec;
  return {
    lane: { basis: market.lane, sessionOpen: session.open, halt, laneState: laneState(session, asset, market.lane, market.intervalSec) },
    ctx: {
      ...(nextOpenSec === null ? {} : { opensText: when(nextOpenSec) }),
      ...(halt ? { haltStale: haltLabel(halt.reason) === "Signed price stale" } : {}),
    },
  };
}
