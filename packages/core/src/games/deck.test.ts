// Ported from Masayume 68f7a09:packages/core/src/games/deck.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { DECK_MAX, DECK_MIN, INTERVAL_15M_SEC, INTERVAL_1H_SEC, INTERVAL_5M_SEC, nextDealableSec, selectDeck, type DeckCandidate, type DeckPolicy } from "./deck";

const NOW = 1_700_000_000;

const POLICY: DeckPolicy = {
  supportedAssets: ["BTC", "ETH"],
  maxSpreadRaw: 200_000n,
  minDepthRaw: 20_000_000n,
  horizonSec: 2 * 60 * 60,
};

function candidate(n: number, overrides: Partial<DeckCandidate> = {}): DeckCandidate {
  return {
    marketId: toMarketId(`0x${String(n).padStart(64, "0")}`),
    asset: "BTC",
    intervalSec: INTERVAL_15M_SEC,
    expirySec: NOW + 900 + n * 60,
    trading: true,
    spreadRaw: 100_000n,
    depthRaw: 30_000_000n,
    ...overrides,
  };
}

describe("deck selection", () => {
  it("deals two to five distinct Windows, soonest first", () => {
    const result = selectDeck([candidate(3), candidate(1), candidate(2), candidate(4)], POLICY, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(4);
    expect(result.cards.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(result.lane).toBe("15m");
    expect(result.cards[0]?.expirySec).toBeLessThan(result.cards[1]?.expirySec ?? 0);
  });

  it("never deals more than five cards", () => {
    const many = Array.from({ length: 9 }, (_, i) => candidate(i + 1));
    const result = selectDeck(many, POLICY, NOW);
    expect(result.ok && result.cards.length).toBe(DECK_MAX);
  });

  it("refuses the 5m lane outright, however eligible it looks", () => {
    const fives = Array.from({ length: 5 }, (_, i) => candidate(i + 1, { intervalSec: INTERVAL_5M_SEC }));
    expect(selectDeck(fives, POLICY, NOW).ok).toBe(false);
  });

  /** Shannon's real shape: two assets, one Window per cadence, so four eligible Windows is a full house. */
  it("takes every eligible Window rather than preferring one cadence, so four beats two", () => {
    const venue = [
      candidate(1, { asset: "BTC" }),
      candidate(2, { asset: "ETH" }),
      candidate(10, { asset: "BTC", intervalSec: INTERVAL_1H_SEC, expirySec: NOW + 2_200 }),
      candidate(11, { asset: "ETH", intervalSec: INTERVAL_1H_SEC, expirySec: NOW + 2_200 }),
    ];
    const result = selectDeck(venue, POLICY, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(4);
    expect(result.lane).toBe("mixed");
    // Soonest first, so the deck resolves in the order its cards settle.
    expect(result.cards.map((c) => c.intervalSec)).toEqual([INTERVAL_15M_SEC, INTERVAL_15M_SEC, INTERVAL_1H_SEC, INTERVAL_1H_SEC]);
  });

  /** The dead zone: the 15m pair is inside its headroom exclusion, leaving only the 1h pair. */
  it("deals the two-card deck the owner approved when only one cadence is left", () => {
    const deadZone = [
      candidate(10, { asset: "BTC", intervalSec: INTERVAL_1H_SEC, expirySec: NOW + 2_200 }),
      candidate(11, { asset: "ETH", intervalSec: INTERVAL_1H_SEC, expirySec: NOW + 2_200 }),
    ];
    const result = selectDeck(deadZone, POLICY, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(DECK_MIN);
    expect(result.lane).toBe("1h");
  });

  it("refuses one card, and never counts a 5m Window towards a deck", () => {
    const alone = [candidate(1), candidate(20, { intervalSec: INTERVAL_5M_SEC }), candidate(21, { intervalSec: INTERVAL_5M_SEC })];
    const result = selectDeck(alone, POLICY, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: "too-few-eligible", eligible: 1, needed: DECK_MIN });
  });

  it("drops Windows that are untradeable, unsupported, wide, thin, too close or past the horizon", () => {
    const bad = [
      candidate(1, { trading: false }),
      candidate(2, { asset: "SOL" }),
      candidate(3, { spreadRaw: 900_000n }),
      candidate(4, { depthRaw: 1n }),
      candidate(5, { expirySec: NOW + 60 }),
      candidate(6, { expirySec: NOW + 5 * 60 * 60 }),
    ];
    const result = selectDeck(bad, POLICY, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: "too-few-eligible", eligible: 0, needed: DECK_MIN });
  });

  /**
   * The countdown a queue shows instead of "waiting". Two 15m Windows sit inside their headroom
   * exclusion; their successors begin at expiry, so the deck becomes dealable the moment they roll.
   */
  it("says when the venue can next supply a deck", () => {
    const stale = [candidate(1, { expirySec: NOW + 100 }), candidate(2, { expirySec: NOW + 100 })];
    expect(selectDeck(stale, POLICY, NOW).ok).toBe(false);
    // At NOW+100 the pair rolls to a fresh 900s Window, which clears the 600s default headroom at once.
    expect(nextDealableSec(stale, POLICY, NOW)).toBe(100);
  });

  it("returns null rather than a guess when nothing is dealable inside the projection", () => {
    const never = [candidate(1, { asset: "SOL" }), candidate(2, { asset: "SOL" })];
    expect(nextDealableSec(never, POLICY, NOW, 300)).toBeNull();
  });

  it("counts one Window once, however many times the venue lists it", () => {
    const dupe = candidate(1);
    expect(selectDeck([dupe, dupe, dupe, dupe], POLICY, NOW).ok).toBe(false);
  });
});
