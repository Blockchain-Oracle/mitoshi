/**
 * What the duel routes say, typed once for both ends (R4-9, D-227; Masayume 68f7a09 web/src/features/games/duel's
 * protocol, over HTTP instead of the game room). Money is a decimal string in base units on the wire; never a float.
 */
import type { Address, Bytes32, MarketId } from "@cwf/core";
import type { ArenaStatus, DeckCard, StakeTierId } from "@cwf/core/games";

export interface DuelPairedWire {
  status: "paired";
  matchId: Bytes32;
  role: "creator" | "challenger";
  creator: Address;
  challenger: Address;
  tier: StakeTierId;
  /** The arena's tier index (core `STAKE_TIERS` order). */
  tierIndex: number;
  potBase: string;
  perCardCapBase: string;
  deckHash: Bytes32;
  deckSize: number;
  policyVersion: number;
}

export type DuelQueueWire =
  | { status: "idle" }
  | { status: "waiting"; tier: StakeTierId; queuedAt: string; /** Seconds until a deck could next be dealt, when known. */ nextDealSec: number | null; refusal: string | null }
  | DuelPairedWire;

export interface DuelPickWire {
  cardIndex: number;
  seat: 0 | 1;
  pick: "up" | "down";
  quantity: string;
  costBase: string;
  payoutBase: string;
  settled: boolean;
}

export interface DuelMatchWire {
  matchId: Bytes32;
  creator: Address;
  challenger: Address;
  tier: StakeTierId;
  potBase: string;
  perCardCapBase: string;
  /** The chain's word on the match; `pending` until the creator's entry lands. */
  status: ArenaStatus | "pending";
  deck: readonly DeckCard[];
  createdAtSec: number;
  joinDeadlineSec: number | null;
  revealDeadlineSec: number | null;
  pickDeadlineSec: number | null;
  picks: readonly DuelPickWire[];
  creatorPnlBase: string;
  challengerPnlBase: string;
  /** Which played cards' Windows the engine has decided (settleable now). */
  decided: readonly number[];
  settledMask: number;
  /** The material `revealDeck` takes — released only once both pots are in. */
  reveal: { serverSeed: Bytes32; clientSeeds: readonly Bytes32[]; cards: readonly MarketId[] } | null;
  /** The caller's unclaimed credit at the arena (payouts and pots). */
  creditBase: string;
}
