// Ported from Masayume 68f7a09:packages/core/src/claims/enumerate.ts
import type { EventMarket } from "../types/market";
import type { ClaimableRow, ClaimLeg, Holdings } from "../types/trading";
import { estPayoutBase } from "./payout";

/** What a claim needs to know about a settled market — a wallet's portfolio row carries all of it. */
export type SettledMarket = Pick<
  EventMarket,
  "marketId" | "asset" | "intervalSec" | "expirySec" | "decimals" | "state" | "winningOutcome" | "resolvedAtMs"
>;

export interface SettledHolding {
  market: SettledMarket;
  holdings: Holdings;
  feeBps: number;
}

function voidLegs(holdings: Holdings): ClaimLeg[] {
  const legs: ClaimLeg[] = [];
  if (holdings.upRaw > 0n) legs.push({ outcomeIdx: 0, amountRaw: holdings.upRaw, payoutBase: estPayoutBase(holdings.upRaw, "void", 0) });
  if (holdings.downRaw > 0n) legs.push({ outcomeIdx: 1, amountRaw: holdings.downRaw, payoutBase: estPayoutBase(holdings.downRaw, "void", 0) });
  return legs;
}

function winLegs(market: SettledMarket, holdings: Holdings, feeBps: number): ClaimLeg[] {
  if (market.winningOutcome === null) return [];
  const amountRaw = market.winningOutcome === 0 ? holdings.upRaw : holdings.downRaw;
  if (amountRaw === 0n) return [];
  return [{ outcomeIdx: market.winningOutcome, amountRaw, payoutBase: estPayoutBase(amountRaw, "win", feeBps) }];
}

/** Every claimable row for a wallet: voids redeem BOTH sides as one row with two legs; a losing side is never a row (canon #11). */
export function enumerateClaimables(settled: readonly SettledHolding[]): ClaimableRow[] {
  const rows: ClaimableRow[] = [];
  for (const { market, holdings, feeBps } of settled) {
    const kind = market.state === "voided" ? "void" : "win";
    const legs = kind === "void" ? voidLegs(holdings) : winLegs(market, holdings, feeBps);
    const netPayoutBase = legs.reduce((sum, leg) => sum + leg.payoutBase, 0n);
    if (netPayoutBase === 0n) continue;
    rows.push({
      kind,
      marketId: market.marketId,
      asset: market.asset,
      intervalSec: market.intervalSec,
      expirySec: market.expirySec,
      legs,
      netPayoutBase,
      feeBps,
      decimals: market.decimals,
      settledAtMs: market.resolvedAtMs,
    });
  }
  return rows.sort((a, b) => b.expirySec - a.expirySec);
}

export function netClaimableSum(rows: readonly ClaimableRow[]): bigint {
  return rows.reduce((sum, row) => sum + row.netPayoutBase, 0n);
}
