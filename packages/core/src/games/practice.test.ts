// Ported from Masayume 68f7a09:packages/core/src/games/practice.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import {
  PRACTICE_CARD_MIN_LIFE_SEC,
  PRACTICE_IDLE,
  PRACTICE_WATCH_SEC,
  practiceBotSide,
  practiceMove,
  practiceResult,
  practiceScore,
  practiceTransition,
  nextPracticeCard,
  selectPracticeDeck,
  type PracticeCandidate,
  type PracticePick,
  type PracticeRound,
} from "./practice";
import type { DeckCard } from "./types";

const NOW_SEC = 1_700_000_000;
const NOW_MS = NOW_SEC * 1_000;

function candidate(n: number, overrides: Partial<PracticeCandidate> = {}): PracticeCandidate {
  return {
    marketId: toMarketId(`0x${String(n).padStart(64, "0")}`),
    asset: "BTC",
    intervalSec: 900,
    expirySec: NOW_SEC + 300 + n * 60,
    trading: true,
    ...overrides,
  };
}

function pick(cardIndex: number, side: "up" | "down", entryRaw: bigint, atMs = NOW_MS): PracticePick {
  return { cardIndex, side, entryRaw, decimals: 8, atMs };
}

function dealt(cards: readonly DeckCard[], seed = "seed"): PracticeRound {
  return practiceTransition(PRACTICE_IDLE, { kind: "deal", seed, cards });
}

describe("practice deck", () => {
  it("takes live Windows soonest first, up to five", () => {
    const cards = selectPracticeDeck([candidate(4), candidate(1), candidate(3), candidate(2), candidate(6), candidate(5)], NOW_SEC);
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
    expect(cards[0]?.expirySec).toBeLessThan(cards[1]?.expirySec ?? 0);
  });

  it("refuses a Window that cannot outlast the round, so no card dies under the hand playing it", () => {
    const expiring = candidate(1, { expirySec: NOW_SEC + PRACTICE_CARD_MIN_LIFE_SEC });
    expect(selectPracticeDeck([expiring], NOW_SEC)).toHaveLength(0);
    const survives = candidate(1, { expirySec: NOW_SEC + PRACTICE_CARD_MIN_LIFE_SEC + 1 });
    expect(selectPracticeDeck([survives], NOW_SEC)).toHaveLength(1);
  });

  it("keeps a suspended Window out and does not filter on spread or depth, which practice never uses", () => {
    const cards = selectPracticeDeck([candidate(1, { trading: false }), candidate(2), candidate(3, { intervalSec: 300 })], NOW_SEC);
    expect(cards.map((c) => c.intervalSec)).toEqual([900, 300]);
  });

  it("deals one Window once, however many times it is offered", () => {
    expect(selectPracticeDeck([candidate(1), candidate(1), candidate(1)], NOW_SEC)).toHaveLength(1);
  });
});

describe("the practice bot", () => {
  it("is the same hand for the same seed and a different one for a different seed", () => {
    const hand = (seed: string) => [0, 1, 2, 3, 4].map((i) => practiceBotSide(seed, i));
    expect(hand("alpha")).toEqual(hand("alpha"));
    expect(hand("alpha")).not.toEqual(hand("beta"));
  });

  it("plays both sides across a run of cards rather than one of them", () => {
    const sides = new Set(Array.from({ length: 40 }, (_, i) => practiceBotSide("mixed", i)));
    expect(sides).toEqual(new Set(["up", "down"]));
  });
});

describe("scoring a practice card", () => {
  it("reads the feed's direction, with flat as its own answer", () => {
    expect(practiceMove(100n, 101n)).toBe("up");
    expect(practiceMove(100n, 99n)).toBe("down");
    expect(practiceMove(100n, 100n)).toBe("flat");
  });

  it("gives a flat feed to nobody — both sides lose it rather than one winning by default", () => {
    expect(practiceResult("up", 100n, 100n)).toBe("flat");
    expect(practiceResult("down", 100n, 100n)).toBe("flat");
    expect(practiceResult("up", 100n, 101n)).toBe("won");
    expect(practiceResult("down", 100n, 101n)).toBe("lost");
  });
});

describe("the practice round", () => {
  const cards = selectPracticeDeck([candidate(1), candidate(2)], NOW_SEC);

  it("starts the watch only once the last card is swiped, and dates it from that swipe", () => {
    const one = practiceTransition(dealt(cards), { kind: "pick", pick: pick(0, "up", 100n) });
    expect(one.phase).toBe("picking");
    expect(one.watchEndsAtMs).toBeNull();

    const two = practiceTransition(one, { kind: "pick", pick: pick(1, "down", 200n, NOW_MS + 4_000) });
    expect(two.phase).toBe("watching");
    expect(two.watchEndsAtMs).toBe(NOW_MS + 4_000 + PRACTICE_WATCH_SEC * 1_000);
    expect(nextPracticeCard(two)).toBeNull();
  });

  it("ignores a second swipe on a card that is already played, so a doubled gesture cannot re-price it", () => {
    const one = practiceTransition(dealt(cards), { kind: "pick", pick: pick(0, "up", 100n) });
    const again = practiceTransition(one, { kind: "pick", pick: pick(0, "down", 999n) });
    expect(again.picks).toHaveLength(1);
    expect(again.picks[0]?.entryRaw).toBe(100n);
  });

  it("ignores a swipe on a card this deck does not hold", () => {
    const stray = practiceTransition(dealt(cards), { kind: "pick", pick: pick(7, "up", 100n) });
    expect(stray.picks).toHaveLength(0);
  });

  it("scores only from watching, and a deal always starts a clean round", () => {
    const early = practiceTransition(dealt(cards), { kind: "score", closes: [{ cardIndex: 0, closeRaw: 1n }] });
    expect(early.phase).toBe("dealt");

    const played = [pick(0, "up", 100n), pick(1, "down", 200n)].reduce(
      (round, p) => practiceTransition(round, { kind: "pick", pick: p }),
      dealt(cards),
    );
    const scored = practiceTransition(played, {
      kind: "score",
      closes: [
        { cardIndex: 0, closeRaw: 101n },
        { cardIndex: 1, closeRaw: 199n },
      ],
    });
    expect(scored.phase).toBe("scored");

    const fresh = practiceTransition(scored, { kind: "deal", seed: "next", cards });
    expect(fresh).toMatchObject({ phase: "dealt", picks: [], closes: [], watchEndsAtMs: null });
  });

  it("reads a scoreboard back from the round's own readings, and calls an equal one a tie", () => {
    const round: PracticeRound = {
      phase: "scored",
      // Both cards' bot sides are fixed by this seed; the picks below are chosen to mirror them.
      seed: "board",
      cards,
      picks: [pick(0, practiceBotSide("board", 0), 100n), pick(1, practiceBotSide("board", 1), 200n)],
      watchEndsAtMs: NOW_MS,
      closes: [
        { cardIndex: 0, closeRaw: 100n },
        { cardIndex: 1, closeRaw: 200n },
      ],
    };
    const score = practiceScore(round);
    expect(score.cards.map((c) => c.move)).toEqual(["flat", "flat"]);
    expect(score).toMatchObject({ youWon: 0, botWon: 0, winner: null });
  });

  it("leaves a card out of the scoreboard when its close was never read", () => {
    const round: PracticeRound = {
      phase: "scored",
      seed: "partial",
      cards,
      picks: [pick(0, "up", 100n), pick(1, "up", 200n)],
      watchEndsAtMs: NOW_MS,
      closes: [{ cardIndex: 1, closeRaw: 300n }],
    };
    const score = practiceScore(round);
    expect(score.cards.map((c) => c.card.index)).toEqual([1]);
    expect(score.youWon).toBe(1);
  });
});
