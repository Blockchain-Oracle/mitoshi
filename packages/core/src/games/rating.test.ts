// Ported from Masayume 68f7a09:packages/core/src/games/rating.test.ts
import { describe, expect, it } from "vitest";
import { applyResult, expectedScore, isVerifiedResult, K_ESTABLISHED, K_PROVISIONAL, kFactor, NEW_RATING, nextRating } from "./rating";

describe("elo", () => {
  it("weights a newcomer's first ten verified matches at double", () => {
    expect(kFactor({ rating: 1000, verifiedMatches: 0 })).toBe(K_PROVISIONAL);
    expect(kFactor({ rating: 1000, verifiedMatches: 9 })).toBe(K_PROVISIONAL);
    expect(kFactor({ rating: 1000, verifiedMatches: 10 })).toBe(K_ESTABLISHED);
  });

  it("expects an even match between equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.9);
    expect(expectedScore(1000, 1400)).toBeLessThan(0.1);
  });

  it("moves a provisional winner by the full half-K on an even match", () => {
    // K=48, expected 0.5, score 1 → +24.
    expect(nextRating(NEW_RATING, 1000, 1)).toEqual({ rating: 1024, verifiedMatches: 1 });
    expect(nextRating({ rating: 1000, verifiedMatches: 10 }, 1000, 1)).toEqual({ rating: 1012, verifiedMatches: 11 });
  });

  it("barely moves a favourite who wins and punishes one who loses", () => {
    const favourite = { rating: 1400, verifiedMatches: 20 };
    expect(nextRating(favourite, 1000, 1).rating - favourite.rating).toBeLessThanOrEqual(3);
    expect(favourite.rating - nextRating(favourite, 1000, 0).rating).toBeGreaterThan(20);
  });

  it("updates both sides of a result together", () => {
    const { a, b } = applyResult({ rating: 1000, verifiedMatches: 20 }, { rating: 1000, verifiedMatches: 20 }, 1);
    expect(a.rating).toBe(1012);
    expect(b.rating).toBe(988);
    expect(a.verifiedMatches).toBe(21);
    expect(b.verifiedMatches).toBe(21);
  });

  it("splits a drawn pot without moving equal ratings", () => {
    const { a, b } = applyResult({ rating: 1200, verifiedMatches: 20 }, { rating: 1200, verifiedMatches: 20 }, 0.5);
    expect(a.rating).toBe(1200);
    expect(b.rating).toBe(1200);
  });

  it("refuses to count a refund or a void-only match", () => {
    expect(isVerifiedResult({ refunded: true, settledCards: 3 })).toBe(false);
    expect(isVerifiedResult({ refunded: false, settledCards: 0 })).toBe(false);
    expect(isVerifiedResult({ refunded: false, settledCards: 1 })).toBe(true);
  });
});
