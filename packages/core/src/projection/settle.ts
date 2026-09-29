// Ported from Masayume 68f7a09:packages/core/src/projection/settle.ts
import { estPayoutBase } from "../claims/payout";
import type { OutcomeIdx } from "../types/market";
import type { ClaimLeg, Holdings, Verdict } from "../types/trading";
import type { ClaimState, LedgerSource, MarketLedger, RoundMarket, RoundOutcome, SettledRound } from "./types";

export interface SettleInput {
  ledger: MarketLedger;
  market: RoundMarket;
  feeBps: number;
  /** Head-fresh balances for this market, or null when the read failed — never a guessed zero. */
  liveHoldings: Holdings | null;
  source?: LedgerSource;
}

function legPayout(market: RoundMarket, outcomeIdx: OutcomeIdx, amountRaw: bigint, feeBps: number): bigint {
  if (market.voided) return estPayoutBase(amountRaw, "void", feeBps);
  return market.winningOutcome === outcomeIdx ? estPayoutBase(amountRaw, "win", feeBps) : 0n;
}

function heldLegs(ledger: MarketLedger, market: RoundMarket, feeBps: number): ClaimLeg[] {
  const held: Array<[OutcomeIdx, bigint]> = [
    [0, ledger.heldUpRaw],
    [1, ledger.heldDownRaw],
  ];
  return held.filter(([, amountRaw]) => amountRaw > 0n).map(([outcomeIdx, amountRaw]) => ({ outcomeIdx, amountRaw, payoutBase: legPayout(market, outcomeIdx, amountRaw, feeBps) }));
}

/** Mirrors `deriveVerdict`: a hedged Window gets one net stamp, and a payout that lost money is a loss. */
function outcomeOf(market: RoundMarket, legs: ClaimLeg[], payoutBase: bigint, pnlBase: bigint): RoundOutcome {
  if (legs.length === 0) return "closed";
  if (market.voided) return "void";
  if (payoutBase === 0n) return "loss";
  return pnlBase >= 0n ? "win" : "loss";
}

/**
 * Has the payout reached the wallet? A paying leg whose live balance is zero was redeemed
 * (or moved), one still held is waiting on `/claims`. The redemption itself leaves no
 * per-wallet record the indexer exposes, so the live balance is the honest witness.
 */
function claimStateOf(legs: ClaimLeg[], live: Holdings | null): ClaimState {
  const paying = legs.filter((leg) => leg.payoutBase > 0n);
  if (paying.length === 0) return "none";
  if (live === null) return "unknown";
  const stillHeld = paying.some((leg) => (leg.outcomeIdx === 0 ? live.upRaw : live.downRaw) > 0n);
  return stillHeld ? "to-collect" : "paid";
}

/** One settled round, or null while the Window is still open — every figure is fills plus the settlement rule. */
export function settleRound({ ledger, market, feeBps, liveHoldings, source }: SettleInput): SettledRound | null {
  if (!market.settled) return null;
  const legs = heldLegs(ledger, market, feeBps);
  const payoutBase = legs.reduce((sum, leg) => sum + leg.payoutBase, 0n);
  const feeBase = legs.reduce((sum, leg) => sum + (leg.payoutBase > 0n && !market.voided ? leg.amountRaw - leg.payoutBase : 0n), 0n);
  const pnlBase = ledger.proceedsBase + payoutBase - ledger.costBase;
  return {
    marketId: market.marketId,
    asset: market.asset,
    intervalSec: market.intervalSec,
    expirySec: market.expirySec,
    decimals: market.decimals,
    outcome: outcomeOf(market, legs, payoutBase, pnlBase),
    legs,
    sidesTraded: [...ledger.sidesTraded],
    stakeBase: ledger.costBase,
    proceedsBase: ledger.proceedsBase,
    payoutBase,
    feeBase,
    pnlBase,
    feeBps,
    claim: claimStateOf(legs, liveHoldings),
    source: source ?? ledger.source ?? "wallet",
    settledAtMs: market.resolvedAtMs,
    openedAtMs: ledger.firstAtMs,
    entryTxHash: ledger.entryTxHash,
    fillCount: ledger.fillCount,
    shortCount: ledger.shortCount,
  };
}

/** The moment a round's result is fixed — the chain's resolution when indexed, else the expiry it settles against. */
export function roundSettledAtMs(round: Pick<SettledRound, "settledAtMs" | "expirySec">): number {
  return round.settledAtMs ?? round.expirySec * 1000;
}

/** The receipt reads a round as a Verdict: cost basis is what stayed in, net of anything sold back before expiry. */
export function toVerdict(round: SettledRound): Verdict {
  const outcome = round.outcome === "closed" ? (round.pnlBase >= 0n ? "win" : "loss") : round.outcome;
  return {
    marketId: round.marketId,
    outcome,
    pnlBase: round.pnlBase,
    payoutBase: round.payoutBase,
    costBasisBase: round.stakeBase - round.proceedsBase,
    legs: round.legs,
    feeBps: round.feeBps,
    decimals: round.decimals,
    settledAtMs: round.settledAtMs,
  };
}
