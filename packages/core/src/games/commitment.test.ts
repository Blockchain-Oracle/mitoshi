// Ported from Masayume 68f7a09:packages/core/src/games/commitment.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";
import { deckCommitmentPreimage, luckyDrawMessage, mapLuckyDraw, unbiasedIndex, verifyDeckCommitment, type DeckCommitmentInput } from "./commitment";

const INPUT: DeckCommitmentInput = {
  chainId: 50_312,
  arena: "0xaaaa000000000000000000000000000000000001" as Address,
  matchId: `0x${"11".repeat(32)}` as Bytes32,
  policyVersion: 1,
  serverSeed: `0x${"22".repeat(32)}` as Bytes32,
  clientSeeds: [`0x${"33".repeat(32)}` as Bytes32, `0x${"44".repeat(32)}` as Bytes32],
  cards: [toMarketId(`0x${"a1".repeat(32)}`), toMarketId(`0x${"b2".repeat(32)}`), toMarketId(`0x${"c3".repeat(32)}`)],
};

/**
 * The golden vector. `GameArena.revealDeck` must produce these exact bytes before it hashes; if this
 * literal ever has to change, the contract changes in the same commit or the reveal stops verifying.
 */
const GOLDEN =
  "0x000000000000000000000000000000000000000000000000000000000000c488" +
  "000000000000000000000000aaaa000000000000000000000000000000000001" +
  "1111111111111111111111111111111111111111111111111111111111111111" +
  "0000000000000000000000000000000000000000000000000000000000000001" +
  "2222222222222222222222222222222222222222222222222222222222222222" +
  "0000000000000000000000000000000000000000000000000000000000000002" +
  "3333333333333333333333333333333333333333333333333333333333333333" +
  "4444444444444444444444444444444444444444444444444444444444444444" +
  "0000000000000000000000000000000000000000000000000000000000000003" +
  "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1" +
  "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2" +
  "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";

describe("deck commitment", () => {
  it("encodes twelve 32-byte words in the canonical order", () => {
    const preimage = deckCommitmentPreimage(INPUT);
    expect(preimage).toBe(GOLDEN);
    expect(preimage.slice(2)).toHaveLength(12 * 64);
  });

  it("separates decks that differ only in a card, a seed or the arena", () => {
    const base = deckCommitmentPreimage(INPUT);
    expect(deckCommitmentPreimage({ ...INPUT, cards: [...INPUT.cards].reverse() })).not.toBe(base);
    expect(deckCommitmentPreimage({ ...INPUT, clientSeeds: [...INPUT.clientSeeds].reverse() })).not.toBe(base);
    expect(deckCommitmentPreimage({ ...INPUT, chainId: 1 })).not.toBe(base);
    expect(deckCommitmentPreimage({ ...INPUT, policyVersion: 2 })).not.toBe(base);
  });

  it("cannot be made ambiguous by moving an element between the two arrays", () => {
    const moved = deckCommitmentPreimage({ ...INPUT, clientSeeds: [...INPUT.clientSeeds, INPUT.cards[0] as Bytes32], cards: INPUT.cards.slice(1) });
    // The explicit counts are what make this impossible; without them the words would concatenate the same.
    expect(moved).not.toBe(deckCommitmentPreimage(INPUT));
  });

  it("verifies a reveal against the hash the caller's own keccak produces", () => {
    // A stand-in that depends on every byte, so a one-word change really does change the digest.
    const fakeKeccak = (p: string) => {
      let h = 0x811c9dc5;
      for (let i = 2; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 0x01000193) >>> 0;
      return `0x${h.toString(16).padStart(8, "0").repeat(8)}` as Bytes32;
    };
    const commitment = fakeKeccak(deckCommitmentPreimage(INPUT));
    expect(verifyDeckCommitment(INPUT, commitment, fakeKeccak)).toBe(true);
    expect(verifyDeckCommitment(INPUT, commitment.toUpperCase().replace("0X", "0x") as Bytes32, fakeKeccak)).toBe(true);
    expect(verifyDeckCommitment({ ...INPUT, policyVersion: 2 }, commitment, fakeKeccak)).toBe(false);
  });

  it("binds a lucky draw to its wallet and nonce", () => {
    const message = luckyDrawMessage({ clientSeed: INPUT.serverSeed, wallet: INPUT.arena, nonce: 7, policyVersion: 1 });
    expect(message.slice(2)).toHaveLength(4 * 64);
    expect(message).not.toBe(luckyDrawMessage({ clientSeed: INPUT.serverSeed, wallet: INPUT.arena, nonce: 8, policyVersion: 1 }));
  });
});

describe("unbiased draw mapping", () => {
  it("discards the bytes that would favour the low indices", () => {
    // With n = 5 the fair range is [0, 255); 255 must be rejected and the next byte used.
    expect(unbiasedIndex(new Uint8Array([255, 7]), 0, 5)).toEqual({ index: 2, cursor: 2 });
    expect(unbiasedIndex(new Uint8Array([7]), 0, 5)).toEqual({ index: 2, cursor: 1 });
  });

  it("costs no entropy for a single option and refuses an empty range", () => {
    expect(unbiasedIndex(new Uint8Array([]), 0, 1)).toEqual({ index: 0, cursor: 0 });
    expect(() => unbiasedIndex(new Uint8Array([1]), 0, 0)).toThrow();
  });

  it("says so rather than guessing when the stream runs out", () => {
    expect(() => unbiasedIndex(new Uint8Array([255, 255]), 0, 5)).toThrow(/entropy/);
  });

  it("is uniform over a long stream", () => {
    const bytes = new Uint8Array(Array.from({ length: 2_000 }, (_, i) => i % 256));
    const counts = [0, 0, 0, 0, 0];
    let cursor = 0;
    for (let i = 0; i < 300; i++) {
      const next = unbiasedIndex(bytes, cursor, 5);
      counts[next.index] = (counts[next.index] as number) + 1;
      cursor = next.cursor;
    }
    for (const count of counts) expect(count).toBeGreaterThan(40);
  });

  it("maps asset, then side, then reach — the same bytes always giving the same draw", () => {
    const options = { assets: ["BTC", "ETH"], multipliers: [2, 3, 5, 10, 25] };
    const bytes = new Uint8Array([1, 0, 4]);
    expect(mapLuckyDraw(bytes, options)).toEqual({ asset: "ETH", side: "up", multiplier: 25 });
    expect(mapLuckyDraw(bytes, options)).toEqual(mapLuckyDraw(bytes, options));
    expect(mapLuckyDraw(new Uint8Array([0, 1, 0]), options)).toEqual({ asset: "BTC", side: "down", multiplier: 2 });
  });
});
