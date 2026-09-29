// Ported from Masayume 68f7a09:packages/core/src/games/lifecycle.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";
import { arenaPickKey } from "./arena";
import { activeMatchId, canQueue, IDLE, isTerminal, reduce, transition, type MatchEvent, type MatchState } from "./lifecycle";
import type { CardReceipt, DeckCard } from "./types";

const CREATOR = "0xaaaa111111111111111111111111111111111111" as Address;
const CHALLENGER = "0xbbbb111111111111111111111111111111111111" as Address;
const PLAYERS = { creator: CREATOR, challenger: CHALLENGER };
const COMMITMENT = { hash: `0x${"ab".repeat(32)}` as Bytes32, size: 3, policyVersion: 1 };

const CARDS: readonly DeckCard[] = [0, 1, 2].map((i) => ({
  index: i,
  marketId: toMarketId(`0x${String(i + 1).padStart(64, "0")}`),
  asset: "BTC",
  intervalSec: 900,
  expirySec: 1_700_000_900 + i * 60,
}));

function receipt(player: Address, cardIndex: number, payoutBase: bigint | null = null): CardReceipt {
  return { cardIndex, player, pick: "up", quantity: 1n, costBase: 100n, payoutBase, pickKey: arenaPickKey(50_312, "0xm1", cardIndex, player === CREATOR ? 0 : 1) };
}

const TO_PICKING: readonly MatchEvent[] = [
  { kind: "open", mode: "ranked", tier: "t5" },
  { kind: "queue", nowMs: 1_000, clientSeedCommitment: "0xseed" },
  { kind: "paired", matchId: "0xm1", players: PLAYERS },
  { kind: "commitmentPublished", commitment: COMMITMENT },
  { kind: "deckRevealed", cards: CARDS },
  { kind: "pickingOpened", deadlineMs: 90_000 },
];

const ALL_PICKS: readonly MatchEvent[] = [CREATOR, CHALLENGER].flatMap((p) =>
  CARDS.map((c) => ({ kind: "pickConfirmed", receipt: receipt(p, c.index) }) as MatchEvent),
);

describe("match lifecycle", () => {
  it("walks the whole path from idle to finalized", () => {
    const picking = reduce(TO_PICKING);
    expect(picking.phase).toBe("picking");

    const locked = reduce(ALL_PICKS, picking);
    expect(locked.phase).toBe("locked");

    const settling = transition(locked, { kind: "cardSettled", receipt: receipt(CREATOR, 0, 300n) });
    expect(settling.phase).toBe("settling");

    const finalized = transition(settling, {
      kind: "finalized",
      outcome: { winner: CREATOR, pnlBase: { [CREATOR]: 200n, [CHALLENGER]: -100n } },
    });
    expect(finalized.phase).toBe("finalized");
    expect(isTerminal(finalized.phase)).toBe(true);
  });

  it("locks only when both players have answered every card", () => {
    const picking = reduce(TO_PICKING);
    const partial = reduce(ALL_PICKS.slice(0, 5), picking);
    expect(partial.phase).toBe("picking");
    expect(reduce(ALL_PICKS.slice(5), partial).phase).toBe("locked");
  });

  it("treats a replayed receipt as the same receipt, not a second pick", () => {
    const picking = reduce(TO_PICKING);
    const once = transition(picking, { kind: "pickConfirmed", receipt: receipt(CREATOR, 0) });
    const twice = transition(once, { kind: "pickConfirmed", receipt: receipt(CREATOR, 0) });
    expect(twice.phase).toBe("picking");
    if (twice.phase !== "picking") return;
    expect(twice.receipts).toHaveLength(1);
    // Replaying the full deck twice still locks exactly once rather than over-counting into completion.
    expect(reduce([...ALL_PICKS, ...ALL_PICKS], picking).phase).toBe("locked");
  });

  it("folds a card's settlement into the receipt its pick already wrote", () => {
    const locked = reduce(ALL_PICKS, reduce(TO_PICKING));
    expect(locked.phase).toBe("locked");
    if (locked.phase !== "locked") return;
    expect(locked.receipts).toHaveLength(6);

    const settling = transition(locked, { kind: "cardSettled", receipt: receipt(CREATOR, 0, 300n) });
    expect(settling.phase).toBe("settling");
    if (settling.phase !== "settling") return;
    // Six receipts still, one of them now paid — not seven, which is what a log-identity key would give.
    expect(settling.receipts).toHaveLength(6);
    expect(settling.receipts.find((r) => r.player === CREATOR && r.cardIndex === 0)?.payoutBase).toBe(300n);
  });

  it("forfeits the absent player and refunds when both are absent", () => {
    const picking = reduce(TO_PICKING);
    const forfeited = transition(picking, { kind: "pickDeadlinePassed", incomplete: [CHALLENGER] });
    expect(forfeited.phase).toBe("forfeited");

    const refunded = transition(picking, { kind: "pickDeadlinePassed", incomplete: [CREATOR, CHALLENGER] });
    expect(refunded.phase).toBe("refunded");
    if (refunded.phase !== "refunded") return;
    expect(refunded.reason).toBe("both-incomplete");

    // Nobody missing: the deadline simply locks what is there.
    expect(transition(picking, { kind: "pickDeadlinePassed", incomplete: [] }).phase).toBe("locked");
  });

  it("still finalizes a forfeited match, because the positions bought are still the players'", () => {
    const forfeited = transition(reduce(TO_PICKING), { kind: "pickDeadlinePassed", incomplete: [CHALLENGER] });
    const done = transition(forfeited, { kind: "finalized", outcome: { winner: CREATOR, pnlBase: {} } });
    expect(done.phase).toBe("finalized");
  });

  it("refunds rather than punishes when the operator cannot reveal the deck", () => {
    const committed = reduce(TO_PICKING.slice(0, 4));
    expect(committed.phase).toBe("committed");
    const refunded = transition(committed, { kind: "refunded", reason: "reveal-unavailable" });
    expect(refunded.phase).toBe("refunded");
  });

  it("leaves the queue without moving money, and expires the same way", () => {
    const queued = reduce(TO_PICKING.slice(0, 2));
    expect(transition(queued, { kind: "leaveQueue" }).phase).toBe("cancelled");
    expect(transition(queued, { kind: "queueExpired" }).phase).toBe("expired");
  });

  it("ignores an event that does not belong to the phase, rather than throwing", () => {
    const queued = reduce(TO_PICKING.slice(0, 2));
    expect(transition(queued, { kind: "cardSettled", receipt: receipt(CREATOR, 0, 1n) })).toBe(queued);
    expect(transition(IDLE, { kind: "queue", nowMs: 1, clientSeedCommitment: "0x" })).toBe(IDLE);
  });

  it("lets a server snapshot win over whatever the client believed", () => {
    const snapshot: MatchState = {
      phase: "locked",
      matchId: "0xm1",
      players: PLAYERS,
      mode: "ranked",
      tier: "t5",
      cards: CARDS,
      receipts: [],
    };
    expect(transition(IDLE, { kind: "resync", snapshot })).toBe(snapshot);
    expect(transition(reduce(TO_PICKING), { kind: "resync", snapshot })).toBe(snapshot);
  });

  /**
   * The stall this event exists to end: a dissolve used to arrive as a plain `error`, which carries no
   * lifecycle meaning, so a client sat on "sealing the deck" while the room paired it with somebody else.
   */
  it("leaves a pairing the room has dissolved, keeping the stake that was chosen", () => {
    const matched = reduce(TO_PICKING.slice(0, 3));
    expect(matched.phase).toBe("matched");
    const after = transition(matched, { kind: "pairingDissolved", matchId: "0xm1" });
    expect(after).toEqual({ phase: "readiness", mode: "ranked", tier: "t5" });
    expect(canQueue(after)).toBe(true);

    // A deck sealed for a match the arena was never told about dissolves the same way.
    const committed = reduce(TO_PICKING.slice(0, 4));
    expect(committed.phase).toBe("committed");
    expect(transition(committed, { kind: "pairingDissolved", matchId: "0xM1" }).phase).toBe("readiness");
  });

  it("ignores a dissolve that names a different match", () => {
    const matched = reduce(TO_PICKING.slice(0, 3));
    expect(transition(matched, { kind: "pairingDissolved", matchId: "0xm2" })).toBe(matched);
    // And one that arrives after the match reached the chain leaves the live match alone.
    const picking = reduce(TO_PICKING);
    expect(transition(picking, { kind: "pairingDissolved", matchId: "0xm1" })).toBe(picking);
  });

  it("offers a new queue only when nothing is in flight", () => {
    expect(canQueue(IDLE)).toBe(true);
    const picking = reduce(TO_PICKING);
    expect(canQueue(picking)).toBe(false);
    expect(activeMatchId(picking)).toBe("0xm1");

    const finalized = transition(reduce(ALL_PICKS, picking), { kind: "finalized", outcome: { winner: null, pnlBase: {} } });
    expect(activeMatchId(finalized)).toBeNull();
  });
});
