// Ported from Masayume 68f7a09:packages/core/src/games/types.ts
import type { MarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";

/**
 * The vocabulary every game surface, actor and contract adapter shares.
 *
 * Two rules are encoded here rather than repeated in components. First, a mode's economic kind is a
 * property of the mode, not of the screen drawing it: `/games/practice` cannot accidentally grow a
 * wallet write because `economicKindOf("practice")` is `none` and the write lanes refuse it. Second,
 * every enum that also exists in Solidity is declared in the contract's own order, with an index
 * mapper beside it, so an ABI decode and a TypeScript literal can never drift apart silently.
 */

/** The eight routes under `/games`. `range` is Stage 5's live reserve; the rest are Stage 6. */
export type GameId = "practice" | "duel" | "lucky" | "range" | "moonshot" | "line-rider" | "candle-hop";

export const GAME_IDS: readonly GameId[] = ["practice", "duel", "lucky", "range", "moonshot", "line-rider", "candle-hop"];

/** How `/games` groups its selection: the hub shows these three sections and nothing else. */
export type GameGroup = "prediction" | "duel" | "arcade";

/**
 * What a mode is allowed to spend. The authority table fixes these (`04-game-system.md:37-50`):
 * `none` never creates a position; `market-order` spends real tUSDC on the book but escrows no pot;
 * `market-order-and-pot` adds the separately escrowed side-pot; `house-position` is a reserve round
 * where the house fronts the payout.
 */
export type EconomicKind = "none" | "market-order" | "market-order-and-pot" | "house-position";

export interface GameDescriptor {
  id: GameId;
  group: GameGroup;
  economicKind: EconomicKind;
  /** The label every stage must carry, verbatim — the honest one-liner about whose money is at risk. */
  economicLabel: string;
}

const DESCRIPTORS: Readonly<Record<GameId, GameDescriptor>> = {
  practice: { id: "practice", group: "duel", economicKind: "none", economicLabel: "Practice · no stake" },
  duel: { id: "duel", group: "duel", economicKind: "market-order-and-pot", economicLabel: "Market picks plus side-pot" },
  lucky: { id: "lucky", group: "prediction", economicKind: "market-order", economicLabel: "One real order on the book" },
  range: { id: "range", group: "prediction", economicKind: "house-position", economicLabel: "A band priced by the house" },
  moonshot: { id: "moonshot", group: "prediction", economicKind: "house-position", economicLabel: "A reach priced by the house" },
  "line-rider": { id: "line-rider", group: "arcade", economicKind: "none", economicLabel: "Arcade score · not on-chain" },
  "candle-hop": { id: "candle-hop", group: "arcade", economicKind: "none", economicLabel: "Arcade score · not on-chain" },
};

export function gameDescriptor(id: GameId): GameDescriptor {
  return DESCRIPTORS[id];
}

export function gamesInGroup(group: GameGroup): readonly GameDescriptor[] {
  return GAME_IDS.map(gameDescriptor).filter((g) => g.group === group);
}

/** True when the mode can move a player's money — the gate every write lane asks before it signs. */
export function spendsMoney(id: GameId): boolean {
  return gameDescriptor(id).economicKind !== "none";
}

/**
 * Free carries no side-pot but its picks are still real market orders; Ranked adds the pot and is the
 * only mode that moves a rating (`06-game-architecture.md` §Owner decisions 3 and 8).
 */
export type DuelMode = "free" | "ranked";

/**
 * The owner's answer on 2026-09-03: Flicky's tiers, with a per-card order cap so one deck cannot spend
 * more than the tier it was entered at. Amounts are whole tUSDC; base units are derived at the seam so
 * this table never hard-codes a decimals assumption.
 */
export interface StakeTier {
  id: "free" | "t1" | "t5" | "t10";
  mode: DuelMode;
  /** Side-pot each player escrows, in whole collateral units. Free escrows nothing. */
  potUnits: number;
  /** The most one card's market order may cost, in whole collateral units. */
  perCardCapUnits: number;
}

export const STAKE_TIERS: readonly StakeTier[] = [
  { id: "free", mode: "free", potUnits: 0, perCardCapUnits: 1 },
  { id: "t1", mode: "ranked", potUnits: 1, perCardCapUnits: 1 },
  { id: "t5", mode: "ranked", potUnits: 5, perCardCapUnits: 1 },
  { id: "t10", mode: "ranked", potUnits: 10, perCardCapUnits: 1 },
];

export type StakeTierId = StakeTier["id"];

export function stakeTier(id: StakeTierId): StakeTier {
  const tier = STAKE_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`unknown stake tier ${id}`);
  return tier;
}

/** Whole units → base units, at the collateral's own decimals. Never a float. */
export function toBaseUnits(units: number, decimals: number): bigint {
  if (!Number.isInteger(units) || units < 0) throw new Error(`stake units must be a non-negative integer, got ${units}`);
  return BigInt(units) * 10n ** BigInt(decimals);
}

/** `GameArena`'s states, in the contract's enum order (`06-game-architecture.md` §GameArena). */
export type ArenaStatus = "waiting" | "activeUnrevealed" | "picking" | "settling" | "finalized" | "refunded" | "forfeited";

export const ARENA_STATUSES: readonly ArenaStatus[] = [
  "waiting",
  "activeUnrevealed",
  "picking",
  "settling",
  "finalized",
  "refunded",
  "forfeited",
];

export function arenaStatusOf(index: number): ArenaStatus {
  const status = ARENA_STATUSES[index];
  if (!status) throw new Error(`unknown arena status ${index}`);
  return status;
}

export function arenaStatusIndex(status: ArenaStatus): number {
  return ARENA_STATUSES.indexOf(status);
}

/** YES or NO on one card — the swipe, in the venue's own two-sided vocabulary. */
export type Pick = "up" | "down";

export const PICKS: readonly Pick[] = ["up", "down"];

export function pickOf(index: number): Pick {
  const pick = PICKS[index];
  if (!pick) throw new Error(`unknown pick ${index}`);
  return pick;
}

/** One card of a revealed deck: the Window it is about, and where it sits in the deck's order. */
export interface DeckCard {
  index: number;
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
}

/**
 * What the arena recorded for one player on one card. `costBase` and `quantity` are measured by the
 * contract around the IOC — never the quote the UI showed — and `payoutBase` arrives at settlement.
 */
export interface CardReceipt {
  cardIndex: number;
  player: Address;
  pick: Pick;
  quantity: bigint;
  costBase: bigint;
  payoutBase: bigint | null;
  /**
   * `chainId:matchId:cardIndex:seat` — the pick's own coordinates, from `arenaPickKey`.
   *
   * Not the chain's `(chainId, txHash, logIndex)`, and the difference matters: one card produces two
   * logs, `PickFilled` and later `CardSettled`, so a log-identity key would append a second receipt for
   * a card that settled instead of filling in its payout — and `picksComplete`, which counts two
   * receipts per card, would lock a match that is one pick short. A pick is unique per card per seat by
   * the contract's own mask, so its coordinates are the identity a state read and a log both derive.
   */
  pickKey: string;
}

export interface MatchPlayers {
  creator: Address;
  challenger: Address | null;
}

/** The commitment a deck is published under, before any card is known to either player. */
export interface DeckCommitment {
  hash: Bytes32;
  size: number;
  policyVersion: number;
}
