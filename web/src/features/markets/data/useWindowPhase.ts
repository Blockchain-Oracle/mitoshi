"use client";
/** The one lifecycle every surface derives from (AD-1), fed the head-fresh opening print and on-chain status. */
import type { EventMarket } from "@cwf/core";
import { phase as phaseOf, type MarketPhase } from "@cwf/core/lifecycle";
import { useOnchain, useOpeningPrice } from "@cwf/markets/react";

/**
 * `openingUnread`: the chain didn't answer the opening-print read (D-230 item 6: a rate-limited RPC) and the lanes'
 * copy has none — the Window may well be trading, so a surface says it can't read it rather than "waiting".
 */
export function useWindowPhase(market: EventMarket | null, nowMs: number): { phase: MarketPhase | null; openingRaw: bigint | null; openingUnread: boolean } {
  const opening = useOpeningPrice(market?.marketId ?? null);
  const onchain = useOnchain(market?.marketId ?? null);
  const openingRaw = opening?.ok ? opening.value : (market?.openingPriceRaw ?? null);
  const openingUnread = opening !== null && !opening.ok && openingRaw === null;
  if (!market || nowMs <= 0) return { phase: null, openingRaw, openingUnread };
  return { phase: phaseOf({ ...market, openingPriceRaw: openingRaw, onchainStatus: onchain?.ok ? onchain.value.status : null }, nowMs), openingRaw, openingUnread };
}
