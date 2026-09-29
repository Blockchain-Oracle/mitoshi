// Ported from Masayume 68f7a09:packages/core/src/games/picking.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { PICK_ATTEMPT_MAX, cardLifeLeftSec, cardPlayable, pickFloorRaw, pickWindowEndsSec } from "./picking";
import type { DeckCard } from "./types";

const NOW_SEC = 1_700_000_000;
/** The deployed arena's own floor, read back from Shannon on 2026-09-03. */
const PARAMS = { minCardLifeSec: 240 };

function card(index: number, lifeSec: number): DeckCard {
  return { index, marketId: toMarketId(`0x${String(index + 1).padStart(64, "0")}`), asset: "BTC", intervalSec: 900, expirySec: NOW_SEC + lifeSec };
}

describe("the arena's entry gate", () => {
  /** The three readings `context/54` §4 measured by quoting live Windows rather than reasoning. */
  it("plays a card the arena would quote and refuses one it would not, at the arena's own floor", () => {
    expect(cardPlayable(card(0, 278), PARAMS, NOW_SEC)).toBe(true);
    expect(cardPlayable(card(0, 240), PARAMS, NOW_SEC)).toBe(true);
    expect(cardPlayable(card(0, 189), PARAMS, NOW_SEC)).toBe(false);
    expect(cardPlayable(card(0, 61), PARAMS, NOW_SEC)).toBe(false);
  });

  it("counts the life a player can still use, and never counts below zero", () => {
    expect(cardLifeLeftSec(card(0, 300), PARAMS, NOW_SEC)).toBe(60);
    expect(cardLifeLeftSec(card(0, 100), PARAMS, NOW_SEC)).toBe(0);
  });
});

describe("the countdown a stage may show", () => {
  it("takes the arena's deadline when every card outlives it", () => {
    const cards = [card(0, 900), card(1, 3_600)];
    expect(pickWindowEndsSec(cards, PARAMS, NOW_SEC + 180)).toBe(NOW_SEC + 180);
  });

  /** `context/54` §5: the pick window can legally outrun the soonest card's usable life. */
  it("takes the soonest card's own cutoff when that comes first, rather than promising dead seconds", () => {
    const cards = [card(0, 300), card(1, 3_600)];
    expect(pickWindowEndsSec(cards, PARAMS, NOW_SEC + 180)).toBe(NOW_SEC + 60);
  });

  it("falls back to the arena's deadline for an empty deck", () => {
    expect(pickWindowEndsSec([], PARAMS, NOW_SEC + 180)).toBe(NOW_SEC + 180);
  });
});

describe("the pick's floor under a lost race", () => {
  it("loosens 90 → 70 → 50 percent and then holds, for every attempt the ladder allows", () => {
    expect(pickFloorRaw(10_000n, 1)).toBe(9_000n);
    expect(pickFloorRaw(10_000n, 2)).toBe(7_000n);
    expect(pickFloorRaw(10_000n, 3)).toBe(5_000n);
    expect(pickFloorRaw(10_000n, PICK_ATTEMPT_MAX)).toBe(5_000n);
  });

  it("treats a zeroth attempt as the first rather than reading off the end of the ladder", () => {
    expect(pickFloorRaw(10_000n, 0)).toBe(9_000n);
  });

  it("floors in integer base units — a size is never a float", () => {
    expect(pickFloorRaw(7n, 1)).toBe(6n);
  });
});
