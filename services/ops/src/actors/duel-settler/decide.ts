// Ported from Masayume 68f7a09:services/ops/src/actors/duel-settler/decide.ts (R4-9, D-227) — verbatim but for the
// imports; on Mitoshi the players' browsers open the deck, so the settler's reveal is only the fallback when the
// material is on hand (it never is on this side: the reveal deadline's refund is what a lost deck produces).
import { cardsInMask, type ArenaMatch, type ArenaParams } from "@cwf/core/games";
import type { Bytes32, MarketId } from "@cwf/core";

/**
 * What the arena will accept for one match right now — every crank's precondition, restated from
 * `GameArena.sol` in one place and decided without a signer.
 *
 * The contract is the authority; this only avoids sending a transaction it would revert. Getting a
 * precondition wrong here costs a wasted send, not a wrong outcome — which is exactly why it is worth
 * writing down rather than "try it and see": a reverted `settleCard` still burns the fee of two measured
 * redeems, and a settler that guesses wrong every cycle is a slow leak of the operator's pathUSD.
 *
 * Every action here is permissionless by design (`06-game-architecture.md` §Actors): the settler holds a
 * key to pay gas, never to decide anything. If it stops, any player — or anyone at all — can crank the
 * same calls and the money still goes where the arena already recorded it should.
 */

export type SettlerAction =
  /** Opening a committed deck. Permissionless too: the commitment, not a key, proves it was fixed first. */
  | { kind: "arena-reveal"; matchId: Bytes32; why: string }
  | { kind: "arena-lock"; matchId: Bytes32; why: string }
  | { kind: "arena-settle-card"; matchId: Bytes32; cardIndex: number; why: string }
  | { kind: "arena-finalize"; matchId: Bytes32; why: string }
  | { kind: "arena-refund-unjoined"; matchId: Bytes32; why: string }
  | { kind: "arena-refund-unrevealed"; matchId: Bytes32; why: string };

export interface SettleInput {
  match: ArenaMatch;
  params: ArenaParams;
  cards: readonly MarketId[];
  /** Whether each card's Window is resolved or voided — the venue's answer, not a guess from the clock. */
  settleable: ReadonlySet<MarketId>;
  nowSec: number;
}

/**
 * Every crank this match is ready for, in the order they must happen.
 *
 * A card is settled per card rather than per match because the arena's own idempotence is per card: one
 * Window resolving should not wait on another, and a deck whose last card is void still pays the rest.
 */
export function decideMatch(input: SettleInput): readonly SettlerAction[] {
  const { match, params, cards, settleable, nowSec } = input;
  const { matchId } = match;

  if (match.status === "waiting") {
    const deadline = match.createdAtSec + params.joinWindowSec;
    return nowSec > deadline ? [{ kind: "arena-refund-unjoined", matchId, why: `nobody joined by ${deadline}` }] : [];
  }

  if (match.status === "activeUnrevealed") {
    const deadline = match.joinedAtSec + params.revealWindowSec;
    if (nowSec > deadline) return [{ kind: "arena-refund-unrevealed", matchId, why: `the deck was never opened by ${deadline}` }];
    // Both pots are in and the deck is committed: open it. The caller supplies the material, and when it
    // cannot, this is simply not sent — and the refund above is what the deadline then produces.
    return [{ kind: "arena-reveal", matchId, why: `both pots are in; the deck closes at ${deadline}` }];
  }

  if (match.status === "picking") {
    if (nowSec <= match.pickDeadlineSec) return [];
    return [{ kind: "arena-lock", matchId, why: `the pick window closed at ${match.pickDeadlineSec}` }];
  }

  if (match.status !== "settling" && match.status !== "forfeited") return [];

  // Only cards somebody played need settling — an unplayed card has nothing to redeem, and `finalize`
  // waits on the played mask rather than on the whole deck.
  const played = match.pickedMask0 | match.pickedMask1;
  const outstanding = cardsInMask(played & ~match.settledMask, match.deckSize);
  const actions: SettlerAction[] = [];
  for (const cardIndex of outstanding) {
    const marketId = cards[cardIndex];
    if (!marketId || !settleable.has(marketId)) continue;
    actions.push({ kind: "arena-settle-card", matchId, cardIndex, why: `card ${cardIndex} resolved` });
  }

  // The pot waits for every played card, including the ones this cycle is about to settle: finalizing
  // is the last call, and sending it beside a settlement would race the arena's own check.
  if (actions.length === 0 && (played & ~match.settledMask) === 0) {
    actions.push({ kind: "arena-finalize", matchId, why: `all ${cardsInMask(played, match.deckSize).length} played card(s) settled` });
  }
  return actions;
}

/** True when a match has nothing left for anyone to crank: the pot is decided and the cards are paid. */
export function isDone(match: ArenaMatch): boolean {
  return match.status === "finalized" || match.status === "refunded";
}
