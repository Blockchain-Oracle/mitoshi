// Ported from Masayume 68f7a09:packages/core/src/games/arena.ts
import type { MarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";
import type { RefundReason } from "./lifecycle";
import type { ArenaStatus, Pick, StakeTierId } from "./types";

/**
 * The chain's half of a duel, in the arena contract's own vocabulary.
 *
 * Everything here mirrors `contracts/src/games/IGameArena.sol` one for one, in its declaration order,
 * with an index mapper beside every enum. That is the same discipline `types.ts` applies to `ArenaStatus`,
 * and for the same reason: an ABI decode returns a number, and a number that silently means the wrong
 * thing is a bug no type checker can see.
 */

/** Which side of the table. The contract keys every pick by `cardIndex * 2 + seat`. */
export type Seat = 0 | 1;

export const SEAT_CREATOR: Seat = 0;
export const SEAT_CHALLENGER: Seat = 1;

/**
 * The identity of one pick, everywhere off-chain: the coordinates the contract itself keys by
 * (`cardIndex * 2 + seat`), with the chain and match that scope them.
 *
 * A pick's chain log identity would be the wrong key. `PickFilled` and the later `CardSettled` are two
 * different logs about the same pick, so keying by log would give a settled card two receipts instead of
 * one with a payout — and the lifecycle counts two receipts per card to decide a deck is complete. These
 * coordinates are derivable from a log, from a state read and from the database alike, which is what lets
 * a reconnect's snapshot and a live delta fold onto each other instead of stacking up.
 */
export function arenaPickKey(chainId: number, matchId: string, cardIndex: number, seat: Seat): string {
  return `${chainId}:${matchId.toLowerCase()}:${cardIndex}:${seat}`;
}

/** `IGameArena.RefundReason`, in the contract's enum order. */
export const ARENA_REFUND_REASONS: readonly RefundReason[] = ["creator-cancelled", "join-timeout", "reveal-unavailable", "both-incomplete"];

export function arenaRefundReasonOf(index: number): RefundReason {
  const reason = ARENA_REFUND_REASONS[index];
  if (!reason) throw new Error(`unknown arena refund reason ${index}`);
  return reason;
}

/** Where the arena lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface ArenaDeployment {
  chainId: number;
  gameArena: Address;
  fromBlock: bigint;
}

export const ARENA_NOT_DEPLOYED = "GameArena is not deployed on this network yet" as const;

/** The arena's tunables, as `IGameArena.Params` declares them. */
export interface ArenaParams {
  joinWindowSec: number;
  revealWindowSec: number;
  pickWindowSec: number;
  minDeckSize: number;
  maxDeckSize: number;
  minCardLifeSec: number;
}

/** One priced entry. `potBase` is per player; `perCardCapBase` bounds one card's market order. */
export interface ArenaTier {
  tier: number;
  potBase: bigint;
  perCardCapBase: bigint;
  enabled: boolean;
}

/**
 * The arena's record of a match. `pickedMask0` / `pickedMask1` carry one bit per card per seat, and
 * `settledMask` one bit per card — the same three bytes the contract reasons about, kept as numbers
 * rather than expanded, so a projection can compare them to the chain without re-deriving anything.
 */
export interface ArenaMatch {
  matchId: Bytes32;
  creator: Address;
  challenger: Address;
  tier: number;
  status: ArenaStatus;
  deckSize: number;
  pickedMask0: number;
  pickedMask1: number;
  settledMask: number;
  policyVersion: number;
  deckHash: Bytes32;
  createdAtSec: number;
  joinedAtSec: number;
  revealedAtSec: number;
  pickDeadlineSec: number;
  potBase: bigint;
  perCardCapBase: bigint;
}

/** What the arena measured around one IOC, and what the redemption later paid for it. */
export interface ArenaPick {
  cardIndex: number;
  seat: Seat;
  placed: boolean;
  settled: boolean;
  pick: Pick;
  quantity: bigint;
  costBase: bigint;
  payoutBase: bigint;
}

/** A size read off the live book for a stake, as `sizeForStake` returns it. */
export interface ArenaQuote {
  quantityRaw: bigint;
  costRaw: bigint;
  limitYesRaw: bigint;
  priceRaw: bigint;
}

/** True while the pot is still the arena's to decide. */
export function arenaPotOpen(status: ArenaStatus): boolean {
  return status !== "finalized" && status !== "refunded";
}

/** Every card index whose bit is set in a mask — the shape a projection actually iterates. */
export function cardsInMask(mask: number, deckSize: number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < deckSize; i += 1) if ((mask >> i) & 1) out.push(i);
  return out;
}

/**
 * `GameArena.finalize`'s winner (R4-9, D-227), re-derived from the state it leaves behind: a seat that played every card
 * against one that didn't took a forfeit; otherwise the greater measured P&L; equal P&L is a tie (null — the pot splits).
 */
export function arenaWinnerOf(m: { creator: Address; challenger: Address; deckSize: number; pickedMask0: number; pickedMask1: number }, creatorPnlBase: bigint, challengerPnlBase: bigint): Address | null {
  const full = fullDeckMask(m.deckSize);
  const creatorDone = m.pickedMask0 === full;
  const challengerDone = m.pickedMask1 === full;
  if (creatorDone !== challengerDone) return creatorDone ? m.creator : m.challenger;
  if (creatorPnlBase === challengerPnlBase) return null;
  return creatorPnlBase > challengerPnlBase ? m.creator : m.challenger;
}

/** The mask a complete deck produces, so "did this seat finish" is one comparison. */
export function fullDeckMask(deckSize: number): number {
  return (1 << deckSize) - 1;
}

export function seatComplete(match: ArenaMatch, seat: Seat): boolean {
  const mask = seat === SEAT_CREATOR ? match.pickedMask0 : match.pickedMask1;
  return mask === fullDeckMask(match.deckSize);
}

export function seatOf(match: ArenaMatch, wallet: Address): Seat | null {
  const who = wallet.toLowerCase();
  if (match.creator.toLowerCase() === who) return SEAT_CREATOR;
  if (match.challenger.toLowerCase() === who) return SEAT_CHALLENGER;
  return null;
}

/** The tier the arena priced, matched back to the table core already publishes. */
const TIER_IDS: readonly StakeTierId[] = ["free", "t1", "t5", "t10"];

export function stakeTierIdOf(tier: number): StakeTierId {
  const id = TIER_IDS[tier];
  if (!id) throw new Error(`unknown arena tier ${tier}`);
  return id;
}

/** The index the contract keys a tier by — the inverse, so a caller never hard-codes the order. */
export function stakeTierIndex(id: StakeTierId): number {
  const index = TIER_IDS.indexOf(id);
  if (index === -1) throw new Error(`unknown stake tier ${id}`);
  return index;
}

/**
 * Everything the arena ever says, as data — `IGameArena`'s events in its own vocabulary.
 *
 * The projector reads these rather than raw logs, so exactly one module knows the ABI and everything
 * downstream reasons about a match instead of about a topic. `MatchJoined` has no client message on
 * purpose: a joined match is still `committed` to both players, and the reveal that follows within
 * seconds is what they actually see change.
 */
export type ArenaEvent =
  | { kind: "created"; matchId: Bytes32; creator: Address; tier: number; potBase: bigint; deckHash: Bytes32; deckSize: number; joinDeadlineSec: number }
  | { kind: "joined"; matchId: Bytes32; challenger: Address; potBase: bigint; revealDeadlineSec: number }
  | { kind: "revealed"; matchId: Bytes32; policyVersion: number; cards: readonly MarketId[]; pickDeadlineSec: number }
  | {
      kind: "picked";
      matchId: Bytes32;
      player: Address;
      marketId: MarketId;
      cardIndex: number;
      pick: Pick;
      quantity: bigint;
      costBase: bigint;
      refundBase: bigint;
    }
  /** `forfeitedBy` is the seat that never finished; null when both did and the match is simply settling. */
  | { kind: "locked"; matchId: Bytes32; status: ArenaStatus; forfeitedBy: Address | null }
  | { kind: "settled"; matchId: Bytes32; player: Address; marketId: MarketId; cardIndex: number; payoutBase: bigint; pnlBase: bigint }
  | { kind: "finalized"; matchId: Bytes32; winner: Address | null; creatorPnlBase: bigint; challengerPnlBase: bigint; potAwardedBase: bigint }
  | { kind: "refunded"; matchId: Bytes32; reason: RefundReason; perPlayerBase: bigint }
  | { kind: "claimed"; player: Address; amountBase: bigint; by: Address }
  /** `agent` null is a revocation. */
  | { kind: "agent"; matchId: Bytes32; player: Address; agent: Address | null; expiresAtSec: number; budgetBase: bigint };

/** One event with the chain identity that orders it — and the identity the database inserts against. */
export interface ArenaEventLog {
  event: ArenaEvent;
  blockNumber: bigint;
  txHash: Bytes32;
  logIndex: number;
  blockTimeSec: number;
}

/**
 * The key a seat names at entry: who, for how long, the deck's own ceiling on the stakes it may hand the
 * arena (`perCardCapBase × deckSize`, booked gross), and the gas the entry transaction sends it — so the
 * wallet signs once and the key swipes.
 */
export interface ArenaAgentGrant {
  agent: Address;
  ttlSec: number;
  budgetBase: bigint;
  gasWei: bigint;
}

/** `IGameArena.Agent` as read back: null once revoked or never named. */
export interface ArenaAgent {
  agent: Address;
  expiresAtSec: number;
  budgetBase: bigint;
  spentBase: bigint;
}

/**
 * Everything a duel ever asks the chain to do, as data. The permissionless ones are marked: any caller
 * may crank them, and the money still goes where the arena already recorded it should.
 */
export type ArenaIntent =
  /** With `agent`, the entry names and funds the seat's key in the same transaction (`createMatchWithAgent`). */
  | { kind: "arena-create"; matchId: Bytes32; challenger: Address; tier: number; deckHash: Bytes32; deckSize: number; policyVersion: number; potBase: bigint; agent?: ArenaAgentGrant }
  | { kind: "arena-join"; matchId: Bytes32; potBase: bigint; agent?: ArenaAgentGrant }
  /** Names, or with `agent: null` revokes, the seat's key after entry. */
  | { kind: "arena-authorize"; matchId: Bytes32; agent: Address | null; ttlSec: number }
  /** Permissionless: the commitment, not a key, is what proves the deck was fixed first. */
  | { kind: "arena-reveal"; matchId: Bytes32; serverSeed: Bytes32; clientSeeds: readonly Bytes32[]; cards: readonly MarketId[] }
  | { kind: "arena-pick"; matchId: Bytes32; cardIndex: number; pick: Pick; stakeBase: bigint; minQuantityRaw: bigint }
  /** The same pick, signed by the seat's key: the stake and the refund are `player`'s, the signature is not. */
  | { kind: "arena-pick-for"; player: Address; matchId: Bytes32; cardIndex: number; pick: Pick; stakeBase: bigint; minQuantityRaw: bigint }
  /** Permissionless once the pick deadline has passed. */
  | { kind: "arena-lock"; matchId: Bytes32 }
  /** Permissionless once the card's Window is resolved or voided. */
  | { kind: "arena-settle-card"; matchId: Bytes32; cardIndex: number }
  /** Permissionless once every played card is settled. */
  | { kind: "arena-finalize"; matchId: Bytes32 }
  | { kind: "arena-cancel"; matchId: Bytes32 }
  /** Permissionless once the join window has closed. */
  | { kind: "arena-refund-unjoined"; matchId: Bytes32 }
  /** Permissionless once the reveal window has closed. */
  | { kind: "arena-refund-unrevealed"; matchId: Bytes32 }
  /** Permissionless: the credit only ever goes to the player named. */
  | { kind: "arena-claim"; player: Address };

/**
 * The intents that move the caller's own money and therefore need an allowance first. An entry that names a
 * key covers the deck's ceiling too, because the wallet will not be asked again before the key's picks draw
 * on it; a key's pick spends the player's allowance, not the key's, so it needs none.
 */
export function arenaIntentSpend(intent: ArenaIntent): bigint {
  if (intent.kind === "arena-create" || intent.kind === "arena-join") return intent.potBase + (intent.agent?.budgetBase ?? 0n);
  if (intent.kind === "arena-pick") return intent.stakeBase;
  return 0n;
}
