// Ported from Masayume 68f7a09:packages/core/src/games/protocol.ts
import { z } from "zod";
import { addressSchema, bytes32Schema, type Address } from "../types/primitives";
import type { MatchEvent } from "./lifecycle";
import { decodeDeckCards, decodeMatchState, decodeOutcome, decodeReceipt, wireCommitmentSchema, wireDeckCardSchema, wireMatchStateSchema, wireOutcomeSchema, wireReceiptSchema } from "./wire";

/**
 * The duel room's protocol: every message the browser and the ops room server may exchange, and the
 * one function that turns a server message into reducer events.
 *
 * Three rules are enforced by the shape rather than by the server's care.
 *
 * **No client message carries money.** There is no client message with a cost, a size, a payout or a
 * result in it, so no amount of server bugs can let a browser assert one. The economic messages —
 * `pick.confirmed`, `settlement.progress`, `match.finalized` — exist only in the server union, and the
 * server only ever builds them from a chain log (`06-game-architecture.md`: "Only snapshots/events from
 * chain and Postgres can change economic UI").
 *
 * **`pick.pending` names a card, never a side.** It is the "your opponent is deciding" cue. Relaying the
 * direction would hand the other player a live read on a card they still hold, for the seconds before
 * the chain makes it public anyway; the field simply does not exist, so it cannot be leaked by mistake.
 *
 * **Sequence numbers are absent.** They would be advisory here (`lifecycle.ts` says why): the reducer is
 * total and receipts are keyed by chain log identity, so a duplicate delta is a no-op and a missed one is
 * repaired by the next `snapshot`. A counter would only invite a client to trust ordering it cannot verify.
 */

/** Bumped when a message's meaning changes. A client on another version is refused at `hello`, not tolerated. */
export const ROOM_PROTOCOL_VERSION = 1;

/** Frames above this are dropped by the server before parsing — `ws`'s own `maxPayload`, stated once here. */
export const ROOM_MAX_PAYLOAD_BYTES = 8 * 1024;

/** Silence longer than this fails the heartbeat and the socket is closed; a phone that slept reconnects. */
export const ROOM_HEARTBEAT_MS = 30_000;
export const ROOM_HEARTBEAT_GRACE_MS = 15_000;

export const CHAT_MAX_CHARS = 200;

/** A fixed set, sent as names: the UI owns the glyph, so a room can never be flooded with arbitrary unicode. */
export const REACTIONS = ["fire", "laugh", "shock", "salute", "ice"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** `chainId:arena:matchId` — one room per match per deployment, so two chains never share a room. */
export function roomKey(chainId: number, arena: string, matchId: string): string {
  return `${chainId}:${arena.toLowerCase()}:${matchId.toLowerCase()}`;
}

export interface RoomRef {
  key: string;
  chainId: number;
  arena: Address;
  matchId: string;
}

export function roomRef(chainId: number, arena: Address, matchId: string): RoomRef {
  return { key: roomKey(chainId, arena, matchId), chainId, arena: arena.toLowerCase() as Address, matchId: matchId.toLowerCase() };
}

/**
 * Chat as it is stored and broadcast: trimmed, collapsed, and stripped of the control characters that
 * would otherwise let one line rewrite the transcript around it. Rendering escapes; this normalises.
 */
export function sanitizeChat(body: string): string {
  return body.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_CHARS);
}

/** Every way a room can refuse. `retryable` is the client's instruction: reconnect, or stop and say why. */
export const ROOM_ERROR_CODES = [
  "bad-protocol",
  "unauthenticated",
  "forbidden",
  /** The wallet is in this match, but the seat named another browser's key on chain. Re-key, or play from that browser. */
  "wrong-key",
  "unknown-match",
  "bad-message",
  "rate-limited",
  "too-large",
  "already-queued",
  "queue-unavailable",
  "internal",
] as const;
export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

/** Only a transport or capacity problem is worth retrying; a rejected claim will be rejected again. */
export function isRetryable(code: RoomErrorCode): boolean {
  return code === "rate-limited" || code === "queue-unavailable" || code === "internal";
}

const matchIdSchema = z.string().min(1).max(66);
const modeSchema = z.enum(["free", "ranked"]);
const tierSchema = z.enum(["free", "t1", "t5", "t10"]);
const cardIndexSchema = z.number().int().min(0).max(7);
const playersSchema = z.object({ creator: addressSchema, challenger: addressSchema.nullable() });
const roomRefSchema = z.object({ key: z.string().min(3).max(160), chainId: z.number().int().positive(), arena: addressSchema, matchId: matchIdSchema });

/* ── Browser → room ─────────────────────────────────────────────────────────────────────────────── */

export const clientMessageSchema = z.discriminatedUnion("type", [
  /** The first frame after the upgrade. `resumeMatchId` asks for that match's snapshot instead of the queue's. */
  z.object({ type: z.literal("hello"), protocolVersion: z.number().int(), resumeMatchId: matchIdSchema.nullish() }),
  z.object({
    type: z.literal("queue.join"),
    mode: modeSchema,
    tier: tierSchema,
    region: z.string().min(1).max(24),
    /** `keccak256(seed)`, published before the deck exists — see `seed.reveal`. */
    clientSeedCommitment: bytes32Schema,
  }),
  z.object({ type: z.literal("queue.leave") }),
  /**
   * The other half of the queue's commitment, sent once `match.found` names an opponent.
   *
   * The ceremony is what makes the deck honest: a player commits to a seed while nobody knows who they
   * will face, and reveals it only after the pairing is fixed. The deckmaster checks the reveal against
   * the commitment before it hashes anything, so neither a player nor the server can choose a seed after
   * seeing the other's — which is exactly the property `GameArena.revealDeck` re-checks on chain.
   */
  z.object({ type: z.literal("seed.reveal"), matchId: matchIdSchema, seed: bytes32Schema }),
  z.object({ type: z.literal("pick.pending"), matchId: matchIdSchema, cardIndex: cardIndexSchema }),
  z.object({ type: z.literal("chat"), matchId: matchIdSchema, body: z.string().min(1).max(CHAT_MAX_CHARS * 2) }),
  z.object({ type: z.literal("reaction"), matchId: matchIdSchema, reaction: z.enum(REACTIONS) }),
  /** "I think I missed something" — answered with a whole snapshot, never a replay of deltas. */
  z.object({ type: z.literal("resync"), matchId: matchIdSchema }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];

/* ── Room → browser ─────────────────────────────────────────────────────────────────────────────── */

export const serverMessageSchema = z.discriminatedUnion("type", [
  /**
   * The whole truth, rebuilt from the arena and the projection. Sent after `hello`, after `resync`, and
   * whenever the server would otherwise have to guess whether a client is caught up.
   */
  z.object({
    type: z.literal("snapshot"),
    serverTimeMs: z.number().int().positive(),
    wallet: addressSchema,
    room: roomRefSchema.nullable(),
    state: wireMatchStateSchema,
  }),
  z.object({
    type: z.literal("queue.update"),
    waitingCount: z.number().int().min(0),
    /** The rating band this player's own search has widened to — the queue screen's honest progress. */
    bandNow: z.number().int().min(0),
    waitedMs: z.number().int().min(0),
    /**
     * Seconds until the venue can next supply a deck, or 0 when it can already.
     *
     * The venue rolls its Windows on a fixed schedule and a duel needs Windows with real life left, so
     * there are stretches — about six minutes an hour at the deployed parameters — when no deck exists
     * to deal.
     *
     * Three values, three different things, and a screen must not conflate them: a number is a
     * countdown; `null` is "further out than the projection looked", which is a real answer and not a
     * "soon"; and **absent** is "not known yet", which is what a client sees before the server's first
     * supply read lands. Rendering absent as null would put "no deck for the foreseeable future" in
     * front of someone whose deck is one tick away.
     */
    nextDeckInSec: z.number().int().min(0).nullish(),
  }),
  z.object({
    type: z.literal("match.found"),
    room: roomRefSchema,
    players: playersSchema,
    mode: modeSchema,
    tier: tierSchema,
    opponent: z.object({ wallet: addressSchema, rating: z.number().int().min(0) }),
  }),
  z.object({ type: z.literal("deck.committed"), matchId: matchIdSchema, commitment: wireCommitmentSchema }),
  /**
   * A pairing that no longer exists, said as a state change rather than as an error string.
   *
   * It exists because the room used to report this as an `error`, which carries no lifecycle meaning —
   * so a client whose pairing had dissolved sat on "sealing the deck" forever while the server paired it
   * with somebody else. A dissolve is a fact about the match, so it travels as one, and it names the
   * match it ends: a late dissolve for an abandoned pairing must never take down the live one.
   */
  z.object({
    type: z.literal("match.dissolved"),
    matchId: matchIdSchema,
    /** Said in the room's own words, and shown to the player. Never a code they have to look up. */
    why: z.string().max(200),
    /** True when nobody was at fault and searching again is the obvious next step. */
    searchAgain: z.boolean(),
  }),
  /**
   * A pairing waiting on something, with the clock the room is actually keeping.
   *
   * Two waits happen between `match.found` and `deck.committed` and a spinner cannot tell them apart: the
   * seed ceremony (both browsers, seconds) and the venue's supply (up to minutes, because Windows roll on
   * aligned boundaries). Sending both deadlines is what lets the screen say which one it is and how long
   * is left, instead of a spinner that has looked identical for ninety seconds.
   */
  z.object({
    type: z.literal("match.dealing"),
    matchId: matchIdSchema,
    /** Seeds in, of two. Below two the wait is on a browser; at two it is on the venue. */
    seedsIn: z.number().int().min(0).max(2),
    /** When this pairing is given up on, in server time — the same clock `snapshot.serverTimeMs` carries. */
    givesUpAtMs: z.number().int().positive(),
    serverTimeMs: z.number().int().positive(),
    /** The queue's own three-valued supply fact, repeated here for a pair that is past the queue. */
    nextDeckInSec: z.number().int().min(0).nullish(),
  }),
  z.object({
    type: z.literal("deck.revealed"),
    matchId: matchIdSchema,
    cards: z.array(wireDeckCardSchema).min(2).max(5),
    /** The arena's own `pickDeadlineSec`, in milliseconds — never a countdown the client started itself. */
    deadlineMs: z.number().int().positive(),
  }),
  /** Advisory presence, from the opponent's swipe. No side, no amount — see the header. */
  z.object({ type: z.literal("pick.pending"), matchId: matchIdSchema, player: addressSchema, cardIndex: cardIndexSchema }),
  z.object({ type: z.literal("pick.confirmed"), matchId: matchIdSchema, receipt: wireReceiptSchema }),
  z.object({ type: z.literal("picks.locked"), matchId: matchIdSchema, incomplete: z.array(addressSchema).max(2) }),
  z.object({
    type: z.literal("settlement.progress"),
    matchId: matchIdSchema,
    receipt: wireReceiptSchema,
    settled: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  z.object({ type: z.literal("match.finalized"), matchId: matchIdSchema, outcome: wireOutcomeSchema }),
  z.object({
    type: z.literal("match.refunded"),
    matchId: matchIdSchema,
    reason: z.enum(["creator-cancelled", "join-timeout", "reveal-unavailable", "both-incomplete"]),
  }),
  z.object({
    type: z.literal("presence"),
    room: roomRefSchema,
    players: z.array(z.object({ wallet: addressSchema, online: z.boolean(), lastSeenMs: z.number().int().min(0) })).max(2),
  }),
  z.object({ type: z.literal("chat"), matchId: matchIdSchema, author: addressSchema, body: z.string().max(CHAT_MAX_CHARS), atMs: z.number().int().positive() }),
  z.object({ type: z.literal("reaction"), matchId: matchIdSchema, author: addressSchema, reaction: z.enum(REACTIONS), atMs: z.number().int().positive() }),
  z.object({
    type: z.literal("error"),
    code: z.enum(ROOM_ERROR_CODES),
    message: z.string().max(300),
    retryable: z.boolean(),
    /** The client message that caused it, when there was one — so a UI can blame the right control. */
    about: z.string().max(40).nullish(),
    /** The match a refusal is about, when it is about one — `wrong-key` names the seat to re-key. */
    matchId: matchIdSchema.nullish(),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerMessageType = ServerMessage["type"];

export function roomError(code: RoomErrorCode, message: string, about?: ClientMessageType, matchId?: string): Extract<ServerMessage, { type: "error" }> {
  return { type: "error", code, message, retryable: isRetryable(code), about: about ?? null, matchId: matchId ?? null };
}

/**
 * A server message as reducer events — the single place the wire meets `lifecycle.ts`.
 *
 * Messages that carry no lifecycle meaning (presence, chat, a pending swipe, a queue count) return
 * nothing rather than a no-op event, so a caller can tell "this changed the match" from "this did not"
 * without knowing the protocol. `deck.revealed` returns two events because the arena publishes the deck
 * and the pick deadline in one log, while the lifecycle keeps "the cards are known" separate from "the
 * clock is running" — the practice stage has the first without the second.
 */
export function matchEventsOf(message: ServerMessage): readonly MatchEvent[] {
  switch (message.type) {
    case "snapshot":
      return [{ kind: "resync", snapshot: decodeMatchState(message.state) }];
    case "match.found":
      return [{ kind: "paired", matchId: message.room.matchId, players: message.players }];
    case "deck.committed":
      return [{ kind: "commitmentPublished", commitment: message.commitment }];
    case "deck.revealed":
      return [
        { kind: "deckRevealed", cards: decodeDeckCards(message.cards) },
        { kind: "pickingOpened", deadlineMs: message.deadlineMs },
      ];
    case "pick.confirmed":
      return [{ kind: "pickConfirmed", receipt: decodeReceipt(message.receipt) }];
    case "picks.locked":
      return [{ kind: "pickDeadlinePassed", incomplete: message.incomplete }];
    case "settlement.progress":
      return [{ kind: "cardSettled", receipt: decodeReceipt(message.receipt) }];
    case "match.finalized":
      return [{ kind: "finalized", outcome: decodeOutcome(message.outcome) }];
    case "match.refunded":
      return [{ kind: "refunded", reason: message.reason }];
    case "match.dissolved":
      return [{ kind: "pairingDissolved", matchId: message.matchId }];
    default:
      return [];
  }
}
