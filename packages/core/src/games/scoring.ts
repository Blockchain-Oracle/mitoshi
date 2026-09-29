// Ported from Masayume 68f7a09:packages/core/src/games/scoring.ts
import type { Address } from "../types/primitives";
import type { MatchOutcome } from "./lifecycle";
import type { CardReceipt } from "./types";

/**
 * Who won, and how the side-pot is allocated.
 *
 * The score is real money, not points: each card contributes `payout − actualCost`, both measured by the
 * arena around the fill rather than quoted by a screen. A voided card is not skipped — DreamDEX pays its
 * real 0.5 redemption, so that payout is what counts (`06-game-architecture.md` §/games/duel).
 *
 * The pot is allocated in base units with no division that can lose a unit: an odd split gives the
 * remaining unit to the creator, deterministically, so two independent settlers agree.
 */

export interface PotAllocation {
  creatorBase: bigint;
  challengerBase: bigint;
}

/** Null while the card has not settled; a settled card always has a payout, even if it is zero. */
export function cardPnl(receipt: CardReceipt): bigint | null {
  return receipt.payoutBase === null ? null : receipt.payoutBase - receipt.costBase;
}

/** One player's real PnL over the settled cards. Unsettled cards contribute nothing yet. */
export function playerPnl(receipts: readonly CardReceipt[], player: Address): bigint {
  let total = 0n;
  for (const receipt of receipts) {
    if (receipt.player !== player) continue;
    const pnl = cardPnl(receipt);
    if (pnl !== null) total += pnl;
  }
  return total;
}

export interface SettleInput {
  creator: Address;
  challenger: Address;
  receipts: readonly CardReceipt[];
  /** What each player escrowed. Free duels escrow nothing and allocate nothing. */
  potPerPlayerBase: bigint;
  /** Players who missed the pick deadline. One forfeits the pot; two refund it. */
  incomplete?: readonly Address[];
}

export interface MatchSettlement {
  outcome: MatchOutcome;
  allocation: PotAllocation;
}

function splitPot(potPerPlayerBase: bigint): PotAllocation {
  const total = potPerPlayerBase * 2n;
  const half = total / 2n;
  // The odd unit goes to the creator so every settler computes the same two numbers.
  return { creatorBase: total - half, challengerBase: half };
}

export function settleMatch(input: SettleInput): MatchSettlement {
  const { creator, challenger, receipts, potPerPlayerBase } = input;
  const incomplete = input.incomplete ?? [];
  const pnlBase: Record<Address, bigint> = {
    [creator]: playerPnl(receipts, creator),
    [challenger]: playerPnl(receipts, challenger),
  };
  const total = potPerPlayerBase * 2n;

  // Operator-neutral branches first: an absent player loses only the pot, never their own positions.
  if (incomplete.length >= 2) {
    return { outcome: { winner: null, pnlBase }, allocation: { creatorBase: potPerPlayerBase, challengerBase: potPerPlayerBase } };
  }
  if (incomplete.length === 1) {
    const winner = incomplete[0] === creator ? challenger : creator;
    return {
      outcome: { winner, pnlBase },
      allocation: winner === creator ? { creatorBase: total, challengerBase: 0n } : { creatorBase: 0n, challengerBase: total },
    };
  }

  const creatorPnl = pnlBase[creator] ?? 0n;
  const challengerPnl = pnlBase[challenger] ?? 0n;
  if (creatorPnl === challengerPnl) return { outcome: { winner: null, pnlBase }, allocation: splitPot(potPerPlayerBase) };

  const winner = creatorPnl > challengerPnl ? creator : challenger;
  return {
    outcome: { winner, pnlBase },
    allocation: winner === creator ? { creatorBase: total, challengerBase: 0n } : { creatorBase: 0n, challengerBase: total },
  };
}

/** The ladder's view of one settled match, from the creator's side. */
export function scoreForCreator(outcome: MatchOutcome, creator: Address): 1 | 0.5 | 0 {
  if (outcome.winner === null) return 0.5;
  return outcome.winner === creator ? 1 : 0;
}
