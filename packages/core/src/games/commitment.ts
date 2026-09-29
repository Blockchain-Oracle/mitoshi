// Ported from Masayume 68f7a09:packages/core/src/games/commitment.ts
import type { MarketId } from "../types/market";
import type { Address, Bytes32, Hex } from "../types/primitives";
import type { Pick } from "./types";

/**
 * The canonical preimages a commitment is taken over, and the unbiased mapping from random bytes to a draw.
 *
 * Core carries no hash: `@masayume/core` must stay free of crypto and platform dependencies, and the
 * hash is the one part both Solidity and Node already have. So this module owns the part that is easy to
 * get subtly wrong and hard to notice — the exact byte layout, and the rejection sampling — and takes the
 * hash function as an argument. `GameArena.revealDeck` must mirror `deckCommitmentPreimage` word for word;
 * the golden vectors in `commitment.test.ts` are what keeps the two honest.
 *
 * The layout is fixed 32-byte words with an explicit count before each array, so no two different decks
 * can encode to the same bytes — the concatenation is unambiguous without a length-prefixed hash.
 */

const WORD_HEX = 64;

function word(value: bigint): Hex {
  if (value < 0n) throw new Error("commitment words are unsigned");
  const hex = value.toString(16);
  if (hex.length > WORD_HEX) throw new Error("commitment word overflows 32 bytes");
  return `0x${hex.padStart(WORD_HEX, "0")}`;
}

function hexWord(value: Hex): Hex {
  const body = value.slice(2).toLowerCase();
  if (body.length > WORD_HEX) throw new Error(`value wider than 32 bytes: ${value}`);
  return `0x${body.padStart(WORD_HEX, "0")}`;
}

function concat(words: readonly Hex[]): Hex {
  return `0x${words.map((w) => w.slice(2)).join("")}`;
}

export interface DeckCommitmentInput {
  chainId: number;
  /** Binds the commitment to one deployment, so a deck cannot be replayed against another arena. */
  arena: Address;
  matchId: Bytes32;
  /** Bumped whenever the selection rules change, so an old deck cannot claim a new policy's guarantees. */
  policyVersion: number;
  serverSeed: Bytes32;
  /** Both players', in join order. Neither side alone can steer the deck. */
  clientSeeds: readonly Bytes32[];
  cards: readonly MarketId[];
}

/** The exact bytes hashed into a deck commitment. */
export function deckCommitmentPreimage(input: DeckCommitmentInput): Hex {
  return concat([
    word(BigInt(input.chainId)),
    hexWord(input.arena),
    hexWord(input.matchId),
    word(BigInt(input.policyVersion)),
    hexWord(input.serverSeed),
    word(BigInt(input.clientSeeds.length)),
    ...input.clientSeeds.map(hexWord),
    word(BigInt(input.cards.length)),
    ...input.cards.map(hexWord),
  ]);
}

export type Keccak256 = (preimage: Hex) => Bytes32;

/** True when the revealed deck is the one that was committed to. Case-insensitive, as hex always is. */
export function verifyDeckCommitment(input: DeckCommitmentInput, commitment: Bytes32, keccak256: Keccak256): boolean {
  return keccak256(deckCommitmentPreimage(input)).toLowerCase() === commitment.toLowerCase();
}

/**
 * The message a Lucky draw's HMAC is taken over: `clientSeed | wallet | nonce | policyVersion`, keyed by
 * the server seed that was committed before the reel moved.
 */
export interface LuckyDrawInput {
  clientSeed: Bytes32;
  wallet: Address;
  nonce: number;
  policyVersion: number;
}

export function luckyDrawMessage(input: LuckyDrawInput): Hex {
  return concat([hexWord(input.clientSeed), hexWord(input.wallet), word(BigInt(input.nonce)), word(BigInt(input.policyVersion))]);
}

/**
 * One index in `[0, n)` from a byte stream, without modulo bias.
 *
 * Taking `byte % n` would make the low indices more likely whenever 256 is not a multiple of n — for
 * five multipliers that is a 2.3% edge on the first index, small enough to pass a casual eye and large
 * enough to be a real unfairness in a provable-draw game. Bytes at or above the largest multiple of n
 * are discarded instead.
 */
export function unbiasedIndex(bytes: Uint8Array, cursor: number, n: number): { index: number; cursor: number } {
  if (n <= 0) throw new Error("unbiasedIndex needs a positive range");
  if (n === 1) return { index: 0, cursor };
  const limit = 256 - (256 % n);
  let at = cursor;
  while (at < bytes.length) {
    const byte = bytes[at] as number;
    at += 1;
    if (byte < limit) return { index: byte % n, cursor: at };
  }
  throw new Error("draw exhausted its entropy before a fair index was found");
}

export interface LuckyOptions {
  assets: readonly string[];
  /** The reach ladder, in whole multiples: the owner's 2 / 3 / 5 / 10 / 25. */
  multipliers: readonly number[];
}

export interface LuckyDraw {
  asset: string;
  side: Pick;
  multiplier: number;
}

/**
 * Maps the HMAC's bytes to a draw. Asset, then side, then reach — a fixed order, so a verifier replaying
 * the same bytes reaches the same draw.
 */
export function mapLuckyDraw(bytes: Uint8Array, options: LuckyOptions): LuckyDraw {
  if (options.assets.length === 0 || options.multipliers.length === 0) throw new Error("a draw needs assets and multipliers");
  const asset = unbiasedIndex(bytes, 0, options.assets.length);
  const side = unbiasedIndex(bytes, asset.cursor, 2);
  const reach = unbiasedIndex(bytes, side.cursor, options.multipliers.length);
  return {
    asset: options.assets[asset.index] as string,
    side: side.index === 0 ? "up" : "down",
    multiplier: options.multipliers[reach.index] as number,
  };
}

/** The word encoders, so the other commitments under this layout rule (`lucky.ts`) cannot drift from it. */
export { word as uintWord, hexWord, concat as concatWords };
