// Ported from Masayume 68f7a09:packages/core/src/claims/verdict.ts
import type { MarketId, OnchainSnapshot, OutcomeIdx } from "../types/market";
import type { ClaimLeg, Holdings, Verdict, VerdictOutcome } from "../types/trading";
import { estPayoutBase } from "./payout";

export interface VerdictInput {
  marketId: MarketId;
  /** Head-fresh settlement state; the indexer's status lags the chain (canon #1). */
  settlement: Pick<OnchainSnapshot, "state" | "winningOutcome">;
  holdings: Holdings;
  feeBps: number;
  decimals: number;
  /** null when no entry cost is on record for this wallet. */
  costBasisBase: bigint | null;
  settledAtMs: number | null;
}

function legPayout(input: VerdictInput, outcomeIdx: OutcomeIdx, amountRaw: bigint): bigint {
  if (input.settlement.state === "voided") return estPayoutBase(amountRaw, "void", input.feeBps);
  return input.settlement.winningOutcome === outcomeIdx ? estPayoutBase(amountRaw, "win", input.feeBps) : 0n;
}

function heldLegs(input: VerdictInput): ClaimLeg[] {
  const held: Array<[OutcomeIdx, bigint]> = [
    [0, input.holdings.upRaw],
    [1, input.holdings.downRaw],
  ];
  return held
    .filter(([, amountRaw]) => amountRaw > 0n)
    .map(([outcomeIdx, amountRaw]) => ({ outcomeIdx, amountRaw, payoutBase: legPayout(input, outcomeIdx, amountRaw) }));
}

function outcomeOf(voided: boolean, payoutBase: bigint, pnlBase: bigint): VerdictOutcome {
  if (voided) return "void";
  if (payoutBase === 0n) return "loss";
  return pnlBase >= 0n ? "win" : "loss";
}

/**
 * One verdict per wallet per window: a wallet holding both sides gets ONE stamp on the net figure with both
 * legs listed, never a win card and a loss card side by side. Null while unsettled or when nothing was held.
 */
export function deriveVerdict(input: VerdictInput): Verdict | null {
  if (input.settlement.state === "open") return null;
  const legs = heldLegs(input);
  if (legs.length === 0) return null;
  const payoutBase = legs.reduce((sum, leg) => sum + leg.payoutBase, 0n);
  const pnlBase = input.costBasisBase === null ? payoutBase : payoutBase - input.costBasisBase;
  return {
    marketId: input.marketId,
    outcome: outcomeOf(input.settlement.state === "voided", payoutBase, pnlBase),
    pnlBase,
    payoutBase,
    costBasisBase: input.costBasisBase,
    legs,
    feeBps: input.feeBps,
    decimals: input.decimals,
    settledAtMs: input.settledAtMs,
  };
}
