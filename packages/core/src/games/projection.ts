// Ported from Masayume 68f7a09:packages/core/src/games/projection.ts
import type { Address } from "../types/primitives";
import { arenaPickKey, type ArenaEvent } from "./arena";
import type { Seat } from "./arena";
import type { ServerMessage } from "./protocol";
import type { CardReceipt } from "./types";
import { encodeReceipt } from "./wire";

/**
 * One arena event, as the messages a room should send — the projector's whole translation, pure.
 *
 * It is pure so the interesting cases can be tested without a chain: a settlement that arrives for a
 * pick this process never saw, a lock that forfeits one seat, a finalize with no winner. The projector
 * around it does two things this cannot — reads blocks and writes rows — and nothing else.
 *
 * The rule it exists to keep: **every economic message is built from a log, never from a client.** A
 * receipt's cost and size are the ones the arena measured around the fill, and the only way one reaches
 * a browser is through this function.
 */

export interface MatchFacts {
  creator: Address;
  challenger: Address | null;
  deckSize: number;
}

export function seatFor(facts: MatchFacts, player: Address): Seat | null {
  const who = player.toLowerCase();
  if (facts.creator.toLowerCase() === who) return 0;
  if (facts.challenger?.toLowerCase() === who) return 1;
  return null;
}

export interface ProjectionContext {
  chainId: number;
  facts: MatchFacts;
  /** Picks already seen, by `arenaPickKey`. A settlement needs the cost its pick measured. */
  picks: ReadonlyMap<string, CardReceipt>;
  /** Cards settled so far, including this one — what the progress message counts. */
  settled: number;
}

/** The card receipt a `picked` event carries, keyed by the pick's coordinates rather than by its log. */
export function receiptOfPick(event: Extract<ArenaEvent, { kind: "picked" }>, ctx: ProjectionContext): CardReceipt | null {
  const seat = seatFor(ctx.facts, event.player);
  if (seat === null) return null;
  return {
    cardIndex: event.cardIndex,
    player: event.player.toLowerCase() as Address,
    pick: event.pick,
    quantity: event.quantity,
    costBase: event.costBase,
    payoutBase: null,
    pickKey: arenaPickKey(ctx.chainId, event.matchId, event.cardIndex, seat),
  };
}

/**
 * A settled card's receipt: the payout from this event, over the cost its pick recorded.
 *
 * `CardSettled` does not repeat the cost, so a projector that has not seen the pick — one that started
 * after it, or restarted mid-match — cannot build a whole receipt from the log alone. It returns null
 * rather than a receipt with a zero cost, because a zero cost is a PnL that reads as pure profit. The
 * caller's answer is to load the pick from the arena and try again, not to publish a plausible number.
 */
export function receiptOfSettlement(event: Extract<ArenaEvent, { kind: "settled" }>, ctx: ProjectionContext): CardReceipt | null {
  const seat = seatFor(ctx.facts, event.player);
  if (seat === null) return null;
  const key = arenaPickKey(ctx.chainId, event.matchId, event.cardIndex, seat);
  const pick = ctx.picks.get(key);
  if (!pick) return null;
  return { ...pick, payoutBase: event.payoutBase };
}

function pnlEntries(facts: MatchFacts, creatorPnlBase: bigint, challengerPnlBase: bigint): [Address, string][] {
  const entries: [Address, string][] = [[facts.creator, creatorPnlBase.toString()]];
  if (facts.challenger) entries.push([facts.challenger, challengerPnlBase.toString()]);
  return entries;
}

/** The messages one event produces for the match's room. Empty when the event changes nothing a player sees. */
export function messagesFor(event: ArenaEvent, ctx: ProjectionContext): readonly ServerMessage[] {
  switch (event.kind) {
    /**
     * A reveal produces nothing here on purpose. `DeckRevealed` carries market ids, and a card on a
     * stage is a Window — its asset, its cadence, when it settles — which only the venue can describe.
     * Building a `deck.revealed` from the log alone would mean inventing those, so the projector answers
     * a reveal by re-sending each player a whole snapshot instead, which is the one path that enriches.
     */
    case "revealed":
      return [];

    case "picked": {
      const receipt = receiptOfPick(event, ctx);
      return receipt ? [{ type: "pick.confirmed", matchId: event.matchId, receipt: encodeReceipt(receipt) }] : [];
    }

    case "locked":
      return [{ type: "picks.locked", matchId: event.matchId, incomplete: event.forfeitedBy ? [event.forfeitedBy] : [] }];

    case "settled": {
      const receipt = receiptOfSettlement(event, ctx);
      if (!receipt) return [];
      return [
        {
          type: "settlement.progress",
          matchId: event.matchId,
          receipt: encodeReceipt(receipt),
          settled: ctx.settled,
          total: ctx.facts.deckSize * 2,
        },
      ];
    }

    case "finalized":
      return [
        {
          type: "match.finalized",
          matchId: event.matchId,
          outcome: { winner: event.winner, pnlBase: pnlEntries(ctx.facts, event.creatorPnlBase, event.challengerPnlBase) },
        },
      ];

    case "refunded":
      return [{ type: "match.refunded", matchId: event.matchId, reason: event.reason }];

    /** A creation, a join and a claim all change the record without changing what either player is looking at. */
    default:
      return [];
  }
}
