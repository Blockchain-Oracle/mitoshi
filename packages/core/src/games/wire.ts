// Ported from Masayume 68f7a09:packages/core/src/games/wire.ts
import { z } from "zod";
import { toMarketId } from "../types/market";
import { addressSchema, bytes32Schema, type Address } from "../types/primitives";
import type { MatchOutcome, MatchState } from "./lifecycle";
import type { CardReceipt, DeckCard } from "./types";

/**
 * The JSON form of a match, and the codec back to the state the reducer actually runs on.
 *
 * A room exists to let a browser rebuild a match it was disconnected from, and `lifecycle.ts` already
 * fixed what that rebuild consumes: a whole `MatchState`, delivered as a `resync`. So the wire form is
 * not free-form JSON that a component picks fields out of — it is the same union, minus the two things
 * JSON cannot carry. Base units are decimal strings, never numbers: a `costBase` above 2^53 that arrives
 * as a float is wrong by an amount nobody notices until a payout is short. And `MarketId` is a branded
 * type, so decoding re-brands through `toMarketId` rather than casting, which is what keeps a malformed
 * card out of the deck instead of one call deeper.
 *
 * `pnlBase` travels as entries rather than an object: `payout − cost` is signed, addresses are
 * case-folded, and a JSON object keyed by them invites both a casing collision and a prototype key.
 */

/** Costs, sizes and payouts are unsigned; only a PnL can be negative. */
const unsigned = z.string().regex(/^\d+$/);
const signed = z.string().regex(/^-?\d+$/);

/** The arena's match id is a bytes32, but the pure lifecycle types it as a string — accept its width, no more. */
const matchIdSchema = z.string().min(1).max(66);

const modeSchema = z.enum(["free", "ranked"]);
const tierSchema = z.enum(["free", "t1", "t5", "t10"]);
const pickSchema = z.enum(["up", "down"]);

export const wireDeckCardSchema = z.object({
  index: z.number().int().min(0).max(7),
  marketId: bytes32Schema,
  asset: z.string().min(1).max(16),
  intervalSec: z.number().int().positive(),
  expirySec: z.number().int().positive(),
});

/** `pickKey` is the pick's coordinates (`arenaPickKey`) — the identity a duplicate or a settlement is folded on. */
export const wireReceiptSchema = z.object({
  cardIndex: z.number().int().min(0).max(7),
  player: addressSchema,
  pick: pickSchema,
  quantity: unsigned,
  costBase: unsigned,
  payoutBase: unsigned.nullable(),
  pickKey: z.string().min(1).max(160),
});

export const wireCommitmentSchema = z.object({
  hash: bytes32Schema,
  size: z.number().int().min(2).max(5),
  policyVersion: z.number().int().min(0),
});

export const wireOutcomeSchema = z.object({
  winner: addressSchema.nullable(),
  pnlBase: z.array(z.tuple([addressSchema, signed])).max(2),
});

const entry = { mode: modeSchema, tier: tierSchema } as const;
const identity = {
  ...entry,
  matchId: matchIdSchema,
  players: z.object({ creator: addressSchema, challenger: addressSchema.nullable() }),
} as const;
const dealt = { ...identity, cards: z.array(wireDeckCardSchema).max(5), receipts: z.array(wireReceiptSchema).max(10) } as const;

export const wireMatchStateSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("idle") }),
  z.object({ phase: z.literal("readiness"), ...entry }),
  z.object({ phase: z.literal("queued"), ...entry, queuedAtMs: z.number().int().positive(), clientSeedCommitment: z.string().min(1).max(160) }),
  z.object({ phase: z.literal("matched"), ...identity }),
  z.object({ phase: z.literal("committed"), ...identity, commitment: wireCommitmentSchema }),
  z.object({ phase: z.literal("revealed"), ...identity, commitment: wireCommitmentSchema, cards: z.array(wireDeckCardSchema).max(5) }),
  z.object({ phase: z.literal("picking"), ...dealt, deadlineMs: z.number().int().positive() }),
  z.object({ phase: z.literal("locked"), ...dealt }),
  z.object({ phase: z.literal("settling"), ...dealt }),
  z.object({ phase: z.literal("finalized"), ...identity, outcome: wireOutcomeSchema, receipts: z.array(wireReceiptSchema).max(10) }),
  z.object({ phase: z.literal("cancelled"), ...entry }),
  z.object({ phase: z.literal("expired"), ...entry }),
  z.object({ phase: z.literal("refunded"), ...identity, reason: z.enum(["creator-cancelled", "join-timeout", "reveal-unavailable", "both-incomplete"]) }),
  z.object({ phase: z.literal("forfeited"), ...identity, incomplete: z.array(addressSchema).max(2) }),
]);

export type WireMatchState = z.infer<typeof wireMatchStateSchema>;
export type WireReceipt = z.infer<typeof wireReceiptSchema>;
export type WireDeckCard = z.infer<typeof wireDeckCardSchema>;
export type WireOutcome = z.infer<typeof wireOutcomeSchema>;

export function encodeReceipt(receipt: CardReceipt): WireReceipt {
  return {
    cardIndex: receipt.cardIndex,
    player: receipt.player,
    pick: receipt.pick,
    quantity: receipt.quantity.toString(),
    costBase: receipt.costBase.toString(),
    payoutBase: receipt.payoutBase === null ? null : receipt.payoutBase.toString(),
    pickKey: receipt.pickKey,
  };
}

export function decodeReceipt(wire: WireReceipt): CardReceipt {
  return {
    cardIndex: wire.cardIndex,
    player: wire.player,
    pick: wire.pick,
    quantity: BigInt(wire.quantity),
    costBase: BigInt(wire.costBase),
    payoutBase: wire.payoutBase === null ? null : BigInt(wire.payoutBase),
    pickKey: wire.pickKey,
  };
}

export function encodeOutcome(outcome: MatchOutcome): WireOutcome {
  return {
    winner: outcome.winner,
    pnlBase: Object.entries(outcome.pnlBase).map(([player, pnl]) => [player as Address, pnl.toString()] as [Address, string]),
  };
}

export function decodeOutcome(wire: WireOutcome): MatchOutcome {
  const pnlBase: Record<Address, bigint> = {};
  for (const [player, pnl] of wire.pnlBase) pnlBase[player] = BigInt(pnl);
  return { winner: wire.winner, pnlBase };
}

/** Re-brands a wire deck, so a card that is not a bytes32 market id is refused here rather than at the venue. */
export function decodeDeckCards(cards: readonly WireDeckCard[]): readonly DeckCard[] {
  return cards.map((card) => ({ ...card, marketId: toMarketId(card.marketId) }));
}

/**
 * A state, ready for `JSON.stringify`.
 *
 * The two fields that need converting are the only ones carrying bigints, so the encoder copies the
 * state and rewrites those rather than restating all fourteen phases — a switch would be a second
 * declaration of the union, and the one that silently falls behind when a phase gains a field.
 * `encodeMatchState` is checked against `wireMatchStateSchema` in its own test, which is what makes
 * that shortcut safe rather than merely short.
 */
export function encodeMatchState(state: MatchState): WireMatchState {
  const wire: Record<string, unknown> = { ...state };
  if ("receipts" in state) wire.receipts = state.receipts.map(encodeReceipt);
  if ("outcome" in state) wire.outcome = encodeOutcome(state.outcome);
  return wire as WireMatchState;
}

/** Parses and re-brands. Throws on anything the schema refuses, so a malformed snapshot never reaches the reducer. */
export function decodeMatchState(value: unknown): MatchState {
  const wire = wireMatchStateSchema.parse(value);
  switch (wire.phase) {
    case "idle":
    case "readiness":
    case "queued":
    case "cancelled":
    case "expired":
    case "matched":
    case "committed":
    case "refunded":
    case "forfeited":
      return wire;
    case "revealed":
      return { ...wire, cards: decodeDeckCards(wire.cards) };
    case "picking":
      return { ...wire, cards: decodeDeckCards(wire.cards), receipts: wire.receipts.map(decodeReceipt) };
    case "locked":
    case "settling":
      return { ...wire, cards: decodeDeckCards(wire.cards), receipts: wire.receipts.map(decodeReceipt) };
    case "finalized":
      return { ...wire, outcome: decodeOutcome(wire.outcome), receipts: wire.receipts.map(decodeReceipt) };
  }
}
