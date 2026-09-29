"use client";
/** The one lifecycle every surface derives from (AD-1), fed the head-fresh opening print and on-chain status. */
import type { EventMarket } from "@cwf/core";
import { phase as phaseOf, type MarketPhase } from "@cwf/core/lifecycle";
import { useOnchain, useOpeningPrice } from "@cwf/markets/react";

export function useWindowPhase(market: EventMarket | null, nowMs: number): { phase: MarketPhase | null; openingRaw: bigint | null } {
  const opening = useOpeningPrice(market?.marketId ?? null);
  const onchain = useOnchain(market?.marketId ?? null);
  const openingRaw = opening?.ok ? opening.value : (market?.openingPriceRaw ?? null);
  if (!market || nowMs <= 0) return { phase: null, openingRaw };
  return { phase: phaseOf({ ...market, openingPriceRaw: openingRaw, onchainStatus: onchain?.ok ? onchain.value.status : null }, nowMs), openingRaw };
}
