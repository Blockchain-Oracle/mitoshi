// Ported from Masayume 68f7a09:packages/core/src/games/projection.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";
import { arenaPickKey, type ArenaEvent } from "./arena";
import { messagesFor, receiptOfPick, receiptOfSettlement, seatFor, type MatchFacts, type ProjectionContext } from "./projection";
import type { CardReceipt } from "./types";

const CREATOR = "0xaaaa111111111111111111111111111111111111" as Address;
const CHALLENGER = "0xbbbb111111111111111111111111111111111111" as Address;
const STRANGER = "0xcccc111111111111111111111111111111111111" as Address;
const CHAIN = 50_312;
const MATCH_ID = `0x${"11".repeat(32)}` as Bytes32;
const MARKET = toMarketId(`0x${"22".repeat(32)}`);

const FACTS: MatchFacts = { creator: CREATOR, challenger: CHALLENGER, deckSize: 3 };

function ctx(overrides: Partial<ProjectionContext> = {}): ProjectionContext {
  return { chainId: CHAIN, facts: FACTS, picks: new Map(), settled: 0, ...overrides };
}

const PICKED: Extract<ArenaEvent, { kind: "picked" }> = {
  kind: "picked",
  matchId: MATCH_ID,
  player: CREATOR,
  marketId: MARKET,
  cardIndex: 1,
  pick: "up",
  quantity: 2_000_000n,
  costBase: 940_000n,
  refundBase: 60_000n,
};

const SETTLED: Extract<ArenaEvent, { kind: "settled" }> = {
  kind: "settled",
  matchId: MATCH_ID,
  player: CREATOR,
  marketId: MARKET,
  cardIndex: 1,
  payoutBase: 2_000_000n,
  pnlBase: 1_060_000n,
};

describe("the arena's events, as a room's messages", () => {
  it("seats a player by address, and refuses one who is not in the match", () => {
    expect(seatFor(FACTS, CREATOR)).toBe(0);
    expect(seatFor(FACTS, CHALLENGER.toUpperCase() as Address)).toBe(1);
    expect(seatFor(FACTS, STRANGER)).toBeNull();
  });

  it("carries the cost the arena measured, keyed by the pick's coordinates", () => {
    const receipt = receiptOfPick(PICKED, ctx());
    expect(receipt?.pickKey).toBe(arenaPickKey(CHAIN, MATCH_ID, 1, 0));
    expect(receipt?.costBase).toBe(940_000n);
    expect(receipt?.quantity).toBe(2_000_000n);
    expect(receipt?.payoutBase).toBeNull();

    const [message] = messagesFor(PICKED, ctx());
    expect(message?.type).toBe("pick.confirmed");
    if (message?.type !== "pick.confirmed") return;
    // Decimal strings on the wire: a cost past 2^53 must survive JSON.
    expect(message.receipt.costBase).toBe("940000");
  });

  /** The rule this file exists for: a settlement with no pick behind it is dropped, not guessed at. */
  it("refuses to settle a pick it never saw, rather than inventing a zero cost", () => {
    expect(receiptOfSettlement(SETTLED, ctx())).toBeNull();
    expect(messagesFor(SETTLED, ctx())).toEqual([]);
  });

  it("fills in the payout on the receipt the pick already wrote", () => {
    const pick = receiptOfPick(PICKED, ctx()) as CardReceipt;
    const picks = new Map([[pick.pickKey, pick]]);
    const receipt = receiptOfSettlement(SETTLED, ctx({ picks }));
    expect(receipt?.pickKey).toBe(pick.pickKey);
    expect(receipt?.costBase).toBe(940_000n);
    expect(receipt?.payoutBase).toBe(2_000_000n);

    const [message] = messagesFor(SETTLED, ctx({ picks, settled: 1 }));
    expect(message?.type).toBe("settlement.progress");
    if (message?.type !== "settlement.progress") return;
    expect([message.settled, message.total]).toEqual([1, 6]);
  });

  it("ignores a pick or a settlement from a wallet that is not in the match", () => {
    expect(messagesFor({ ...PICKED, player: STRANGER }, ctx())).toEqual([]);
    expect(messagesFor({ ...SETTLED, player: STRANGER }, ctx())).toEqual([]);
  });

  it("names the seat a lock forfeited, and nobody when both finished", () => {
    const forfeit = messagesFor({ kind: "locked", matchId: MATCH_ID, status: "forfeited", forfeitedBy: CHALLENGER }, ctx());
    expect(forfeit).toEqual([{ type: "picks.locked", matchId: MATCH_ID, incomplete: [CHALLENGER] }]);
    const clean = messagesFor({ kind: "locked", matchId: MATCH_ID, status: "settling", forfeitedBy: null }, ctx());
    expect(clean).toEqual([{ type: "picks.locked", matchId: MATCH_ID, incomplete: [] }]);
  });

  it("reports both PnLs on a finalize, and a null winner on a split", () => {
    const [message] = messagesFor(
      { kind: "finalized", matchId: MATCH_ID, winner: null, creatorPnlBase: -100n, challengerPnlBase: -100n, potAwardedBase: 10_000_000n },
      ctx(),
    );
    expect(message?.type).toBe("match.finalized");
    if (message?.type !== "match.finalized") return;
    expect(message.outcome.winner).toBeNull();
    expect(message.outcome.pnlBase).toEqual([
      [CREATOR, "-100"],
      [CHALLENGER, "-100"],
    ]);
  });

  it("says nothing about a reveal, a creation, a join or a claim", () => {
    const quiet: ArenaEvent[] = [
      { kind: "revealed", matchId: MATCH_ID, policyVersion: 1, cards: [MARKET], pickDeadlineSec: 1_700_000_000 },
      { kind: "created", matchId: MATCH_ID, creator: CREATOR, tier: 1, potBase: 0n, deckHash: MATCH_ID, deckSize: 3, joinDeadlineSec: 1 },
      { kind: "joined", matchId: MATCH_ID, challenger: CHALLENGER, potBase: 0n, revealDeadlineSec: 1 },
      { kind: "claimed", player: CREATOR, amountBase: 1n, by: CREATOR },
    ];
    for (const event of quiet) expect(messagesFor(event, ctx()), event.kind).toEqual([]);
  });

  it("passes a refund's reason through as the arena named it", () => {
    expect(messagesFor({ kind: "refunded", matchId: MATCH_ID, reason: "creator-cancelled", perPlayerBase: 0n }, ctx())).toEqual([
      { type: "match.refunded", matchId: MATCH_ID, reason: "creator-cancelled" },
    ]);
  });
});
