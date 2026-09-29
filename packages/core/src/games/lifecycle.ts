// Ported from Masayume 68f7a09:packages/core/src/games/lifecycle.ts
import type { Address } from "../types/primitives";
import type { CardReceipt, DeckCard, DeckCommitment, DuelMode, MatchPlayers, StakeTierId } from "./types";

/**
 * The one match lifecycle every duel surface derives from, as data rather than component booleans.
 *
 * Two properties matter more than the shape. The reducer is **total**: an event that does not apply to
 * the current phase returns the state unchanged, because a reconnecting client replays events it may
 * already have applied and a WebSocket may deliver them late or twice. And a `resync` always wins —
 * chain and database snapshots are the only things allowed to move economic UI, so a server snapshot
 * overrides whatever the client believed (`06-game-architecture.md` §Matchmaking, realtime and reconnect).
 *
 * Sequence numbers are deliberately absent: they are advisory. Idempotency comes from each receipt's
 * `pickKey` — the card and seat it belongs to — which is why `pickConfirmed` can be applied twice, and
 * why a card's settlement fills in the receipt its pick already wrote.
 */

export type MatchPhase =
  | "idle"
  | "readiness"
  | "queued"
  | "matched"
  | "committed"
  | "revealed"
  | "picking"
  | "locked"
  | "settling"
  | "finalized"
  | "cancelled"
  | "expired"
  | "refunded"
  | "forfeited";

/** `forfeited` is deliberately absent: a forfeited match still settles its cards and allocates its pot. */
const TERMINAL: ReadonlySet<MatchPhase> = new Set<MatchPhase>(["finalized", "cancelled", "expired", "refunded"]);

/**
 * Why a match ended without a winner, in `IGameArena.RefundReason`'s own order and its own words —
 * `creator-cancelled` is a creator withdrawing an unjoined match, not a clock running out. Nobody's
 * fault refunds; a player's absence forfeits.
 */
export type RefundReason = "creator-cancelled" | "join-timeout" | "reveal-unavailable" | "both-incomplete";

export interface MatchEntry {
  mode: DuelMode;
  tier: StakeTierId;
}

export interface MatchIdentity extends MatchEntry {
  matchId: string;
  players: MatchPlayers;
}

export interface MatchOutcome {
  /** Null when the pot was split: equal real PnL, or both sides incomplete. */
  winner: Address | null;
  /** `payout − actualCost` summed over settled cards, per player, in base units. */
  pnlBase: Readonly<Record<Address, bigint>>;
}

export type MatchState =
  | { phase: "idle" }
  | ({ phase: "readiness" } & MatchEntry)
  | ({ phase: "queued"; queuedAtMs: number; clientSeedCommitment: string } & MatchEntry)
  | ({ phase: "matched" } & MatchIdentity)
  | ({ phase: "committed"; commitment: DeckCommitment } & MatchIdentity)
  | ({ phase: "revealed"; commitment: DeckCommitment; cards: readonly DeckCard[] } & MatchIdentity)
  | ({ phase: "picking"; cards: readonly DeckCard[]; receipts: readonly CardReceipt[]; deadlineMs: number } & MatchIdentity)
  | ({ phase: "locked"; cards: readonly DeckCard[]; receipts: readonly CardReceipt[] } & MatchIdentity)
  | ({ phase: "settling"; cards: readonly DeckCard[]; receipts: readonly CardReceipt[] } & MatchIdentity)
  | ({ phase: "finalized"; outcome: MatchOutcome; receipts: readonly CardReceipt[] } & MatchIdentity)
  | ({ phase: "cancelled" } & MatchEntry)
  | ({ phase: "expired" } & MatchEntry)
  | ({ phase: "refunded"; reason: RefundReason } & MatchIdentity)
  | ({ phase: "forfeited"; incomplete: readonly Address[] } & MatchIdentity);

export type MatchEvent =
  | { kind: "open"; mode: DuelMode; tier: StakeTierId }
  | { kind: "queue"; nowMs: number; clientSeedCommitment: string }
  | { kind: "leaveQueue" }
  | { kind: "queueExpired" }
  | { kind: "paired"; matchId: string; players: MatchPlayers }
  | { kind: "commitmentPublished"; commitment: DeckCommitment }
  | { kind: "deckRevealed"; cards: readonly DeckCard[] }
  | { kind: "pickingOpened"; deadlineMs: number }
  | { kind: "pickConfirmed"; receipt: CardReceipt }
  | { kind: "pickDeadlinePassed"; incomplete: readonly Address[] }
  | { kind: "cardSettled"; receipt: CardReceipt }
  | { kind: "finalized"; outcome: MatchOutcome }
  | { kind: "refunded"; reason: RefundReason }
  /**
   * The room's pairing for this match is gone, before anything reached the chain.
   *
   * It carries the match id because a dissolve can arrive late — after the player has been paired again —
   * and a dissolve that took down the wrong match would be worse than the stall it was added to fix.
   */
  | { kind: "pairingDissolved"; matchId: string }
  /** A reconnect's snapshot, rebuilt from the arena and the projection. It always wins. */
  | { kind: "resync"; snapshot: MatchState };

export const IDLE: MatchState = { phase: "idle" };

export function isTerminal(phase: MatchPhase): boolean {
  return TERMINAL.has(phase);
}

/** The hub offers a fresh queue only when nothing is in flight — an active match always wins. */
export function canQueue(state: MatchState): boolean {
  return state.phase === "idle" || state.phase === "readiness" || isTerminal(state.phase);
}

export function activeMatchId(state: MatchState): string | null {
  if (!("matchId" in state)) return null;
  return isTerminal(state.phase) ? null : state.matchId;
}

/** The states that belong to a paired match. `MatchState & { matchId }` would not narrow the union. */
type IdentifiedState = Extract<MatchState, { matchId: string }>;

function identityOf(state: IdentifiedState): MatchIdentity {
  return { matchId: state.matchId, players: state.players, mode: state.mode, tier: state.tier };
}

function receiptsOf(state: MatchState): readonly CardReceipt[] {
  return "receipts" in state ? state.receipts : [];
}

/** Receipts are keyed by the pick's own coordinates, so replaying one is a no-op rather than a double count. */
function withReceipt(receipts: readonly CardReceipt[], receipt: CardReceipt): readonly CardReceipt[] {
  const at = receipts.findIndex((r) => r.pickKey === receipt.pickKey);
  if (at === -1) return [...receipts, receipt];
  const next = [...receipts];
  next[at] = receipt;
  return next;
}

/** Every card carries one receipt per player, so the deck is complete at twice its size. */
export function picksComplete(cards: readonly DeckCard[], receipts: readonly CardReceipt[]): boolean {
  return receipts.length >= cards.length * 2;
}

export function everyCardSettled(cards: readonly DeckCard[], receipts: readonly CardReceipt[]): boolean {
  return picksComplete(cards, receipts) && receipts.every((r) => r.payoutBase !== null);
}

/**
 * Back to the entry, keeping the stake that was chosen.
 *
 * Deliberately NOT back to `queued`: the queue entry is the client's to hold, and the room re-queueing on
 * a player's behalf is what let a browser sit on a dead pairing while the server matched it with someone
 * else. It also reused a seed the player had already revealed. Searching again is the client's next move,
 * with a fresh seed, and this returns it to the state that can make it.
 */
function dissolved(state: IdentifiedState, matchId: string): MatchState {
  if (state.matchId.toLowerCase() !== matchId.toLowerCase()) return state;
  return { phase: "readiness", mode: state.mode, tier: state.tier };
}

export function transition(state: MatchState, event: MatchEvent): MatchState {
  if (event.kind === "resync") return event.snapshot;

  /**
   * `MatchFinalized` and `MatchRefunded` are chain facts, and they are accepted from any in-match phase
   * rather than only from the phase that normally precedes them. A client that was offline through the
   * settlement, or one whose `cardSettled` deltas were dropped, must still land on what the arena
   * recorded — waiting for the intervening events would leave it showing an active match forever.
   */
  if ("matchId" in state && !isTerminal(state.phase)) {
    if (event.kind === "finalized") {
      return { ...identityOf(state), phase: "finalized", outcome: event.outcome, receipts: receiptsOf(state) };
    }
    if (event.kind === "refunded") return { ...identityOf(state), phase: "refunded", reason: event.reason };
  }

  switch (state.phase) {
    case "idle":
      return event.kind === "open" ? { phase: "readiness", mode: event.mode, tier: event.tier } : state;

    case "readiness":
      if (event.kind === "queue") {
        return { phase: "queued", mode: state.mode, tier: state.tier, queuedAtMs: event.nowMs, clientSeedCommitment: event.clientSeedCommitment };
      }
      return event.kind === "open" ? { phase: "readiness", mode: event.mode, tier: event.tier } : state;

    case "queued":
      if (event.kind === "leaveQueue") return { phase: "cancelled", mode: state.mode, tier: state.tier };
      if (event.kind === "queueExpired") return { phase: "expired", mode: state.mode, tier: state.tier };
      if (event.kind === "paired") {
        return { phase: "matched", matchId: event.matchId, players: event.players, mode: state.mode, tier: state.tier };
      }
      return state;

    case "matched":
      if (event.kind === "pairingDissolved") return dissolved(state, event.matchId);
      return event.kind === "commitmentPublished" ? { ...identityOf(state), phase: "committed", commitment: event.commitment } : state;

    case "committed":
      if (event.kind === "deckRevealed") {
        return { ...identityOf(state), phase: "revealed", commitment: state.commitment, cards: event.cards };
      }
      /**
       * A sealed deck whose match never reached the chain also dissolves. The arena is the only thing
       * that can carry a match past this point, so a commitment nobody paid for is a pairing like any
       * other — and leaving the player on "open the match" for a match no opponent can join is the
       * stall this branch exists to end.
       */
      if (event.kind === "pairingDissolved") return dissolved(state, event.matchId);
      return state;

    case "revealed":
      if (event.kind === "pickingOpened") {
        return { ...identityOf(state), phase: "picking", cards: state.cards, receipts: [], deadlineMs: event.deadlineMs };
      }
      return state;

    case "picking": {
      if (event.kind === "pickConfirmed") {
        const receipts = withReceipt(state.receipts, event.receipt);
        if (picksComplete(state.cards, receipts)) {
          return { ...identityOf(state), phase: "locked", cards: state.cards, receipts };
        }
        return { ...state, receipts };
      }
      if (event.kind === "pickDeadlinePassed") {
        if (event.incomplete.length === 0) return { ...identityOf(state), phase: "locked", cards: state.cards, receipts: state.receipts };
        if (event.incomplete.length >= 2) return { ...identityOf(state), phase: "refunded", reason: "both-incomplete" };
        return { ...identityOf(state), phase: "forfeited", incomplete: event.incomplete };
      }
      return state;
    }

    case "locked":
      if (event.kind === "cardSettled") {
        return { ...identityOf(state), phase: "settling", cards: state.cards, receipts: withReceipt(state.receipts, event.receipt) };
      }
      return state;

    case "settling":
      return event.kind === "cardSettled" ? { ...state, receipts: withReceipt(state.receipts, event.receipt) } : state;

    default:
      return state;
  }
}

/** Folds a replayed event log into one state — the reconnect path, and the projector's own. */
export function reduce(events: readonly MatchEvent[], from: MatchState = IDLE): MatchState {
  return events.reduce(transition, from);
}
