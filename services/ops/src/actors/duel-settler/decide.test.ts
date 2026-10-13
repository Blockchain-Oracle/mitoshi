// Ported from Masayume 68f7a09:services/ops/src/actors/duel-settler/decide.test.ts (R4-9, D-227) — verbatim but for the imports.
import type { ArenaMatch, ArenaParams, ArenaStatus } from "@cwf/core/games";
import { toMarketId, type Address, type Bytes32, type MarketId } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { decideMatch, isDone } from "./decide";

const NOW = 1_756_900_000;
const MATCH_ID = `0x${"11".repeat(32)}` as Bytes32;
const CARDS: readonly MarketId[] = [0, 1, 2].map((i) => toMarketId(`0x${String(i + 1).padStart(64, "0")}`));
const ALL = new Set(CARDS);

const PARAMS: ArenaParams = { joinWindowSec: 300, revealWindowSec: 180, pickWindowSec: 120, minDeckSize: 3, maxDeckSize: 5, minCardLifeSec: 240 };

function match(status: ArenaStatus, overrides: Partial<ArenaMatch> = {}): ArenaMatch {
  return {
    matchId: MATCH_ID,
    creator: "0xaaaa111111111111111111111111111111111111" as Address,
    challenger: "0xbbbb111111111111111111111111111111111111" as Address,
    tier: 1,
    status,
    deckSize: 3,
    pickedMask0: 0b111,
    pickedMask1: 0b111,
    settledMask: 0,
    policyVersion: 1,
    deckHash: `0x${"ab".repeat(32)}` as Bytes32,
    createdAtSec: NOW - 1_000,
    joinedAtSec: NOW - 900,
    revealedAtSec: NOW - 800,
    pickDeadlineSec: NOW - 100,
    potBase: 5_000_000n,
    perCardCapBase: 1_000_000n,
    ...overrides,
  };
}

function decide(m: ArenaMatch, settleable: ReadonlySet<MarketId> = ALL, nowSec = NOW) {
  return decideMatch({ match: m, params: PARAMS, cards: CARDS, settleable, nowSec });
}

describe("what the settler may crank", () => {
  it("waits for the join window before returning an unjoined pot", () => {
    const waiting = match("waiting", { createdAtSec: NOW - 100 });
    expect(decide(waiting)).toEqual([]);
    expect(decide(match("waiting", { createdAtSec: NOW - 400 }))[0]?.kind).toBe("arena-refund-unjoined");
  });

  it("opens a committed deck while it can, and refunds it once the window has closed", () => {
    expect(decide(match("activeUnrevealed", { joinedAtSec: NOW - 100 }))[0]?.kind).toBe("arena-reveal");
    expect(decide(match("activeUnrevealed", { joinedAtSec: NOW - 200 }))[0]?.kind).toBe("arena-refund-unrevealed");
  });

  it("locks only after the pick deadline has actually passed", () => {
    expect(decide(match("picking", { pickDeadlineSec: NOW + 10 }))).toEqual([]);
    expect(decide(match("picking", { pickDeadlineSec: NOW - 1 }))[0]?.kind).toBe("arena-lock");
    // The contract's own boundary is strict: at the deadline exactly, it is not yet passed.
    expect(decide(match("picking", { pickDeadlineSec: NOW }))).toEqual([]);
  });

  it("settles only the cards whose Windows the venue says are done", () => {
    const settling = match("settling");
    expect(decide(settling, new Set()).length).toBe(0);
    const partial = decide(settling, new Set([CARDS[0] as MarketId, CARDS[2] as MarketId]));
    expect(partial.map((a) => ("cardIndex" in a ? a.cardIndex : -1))).toEqual([0, 2]);
  });

  it("settles only cards somebody played, and never one already settled", () => {
    // Card 1 was never picked by either seat, and card 0 is already paid.
    const sparse = match("settling", { pickedMask0: 0b101, pickedMask1: 0b100, settledMask: 0b001 });
    expect(decide(sparse).map((a) => ("cardIndex" in a ? a.cardIndex : -1))).toEqual([2]);
  });

  it("finalizes only once every played card is settled, and not beside a settlement", () => {
    const halfway = match("settling", { settledMask: 0b011 });
    expect(decide(halfway).every((a) => a.kind === "arena-settle-card")).toBe(true);

    const done = match("settling", { settledMask: 0b111 });
    expect(decide(done)).toEqual([{ kind: "arena-finalize", matchId: MATCH_ID, why: "all 3 played card(s) settled" }]);
  });

  it("still settles and finalizes a forfeited match, because those positions were paid for", () => {
    const forfeited = match("forfeited", { pickedMask1: 0b011, settledMask: 0 });
    expect(decide(forfeited).length).toBe(3);
    expect(decide(match("forfeited", { pickedMask1: 0b011, settledMask: 0b111 }))[0]?.kind).toBe("arena-finalize");
  });

  it("has nothing to say about a match whose pot is already decided", () => {
    expect(decide(match("finalized"))).toEqual([]);
    expect(decide(match("refunded"))).toEqual([]);
    expect(isDone(match("finalized"))).toBe(true);
    expect(isDone(match("refunded"))).toBe(true);
    expect(isDone(match("settling"))).toBe(false);
  });
});
