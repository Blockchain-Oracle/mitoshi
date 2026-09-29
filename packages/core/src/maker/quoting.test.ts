// Ported from Masayume 68f7a09:packages/core/src/maker/quoting.test.ts
import { describe, expect, it } from "vitest";
import { deployedOf, fairYesRaw, pairAround, quantizeQuantity, quoteExpiryNs, realizedOf, snapDown, snapUp } from "./quoting";

const ONE = 1_000_000n;
const TICK = 1_000n;
const bounds = { tickRaw: TICK, minSpreadRaw: 20_000n, minPriceRaw: 50_000n, maxPriceRaw: 950_000n };

describe("the book's flow", () => {
  const book = { escrowOutBase: 19_480_000n, escrowBackBase: 9_740_000n, mergedBase: 10_000_000n, payoutBase: 0n, settled: false };
  it("deployed floors at zero once the venue handed more back than it took", () => {
    expect(deployedOf(book)).toBe(0n);
    expect(deployedOf({ ...book, mergedBase: 0n })).toBe(9_740_000n);
  });
  it("realized is signed and only once settled", () => {
    expect(realizedOf(book)).toBeNull();
    expect(realizedOf({ ...book, settled: true })).toBe(260_000n);
    expect(realizedOf({ escrowOutBase: 9_600_000n, escrowBackBase: 0n, mergedBase: 0n, payoutBase: 0n, settled: true })).toBe(-9_600_000n);
  });
});

describe("pairAround", () => {
  it("sits symmetrically around the fair on the tick grid", () => {
    const pair = pairAround({ fairRaw: 500_000n, halfSpreadRaw: 15_000n, bestBidRaw: 470_000n, bestAskRaw: 530_000n, ...bounds });
    expect(pair).toEqual({ bidYesRaw: 485_000n, askYesRaw: 515_000n });
  });
  it("never crosses the live book — the fork run's ETH book: bids to 0.343, asks from 0.370", () => {
    const pair = pairAround({ fairRaw: 356_500n, halfSpreadRaw: 5_000n, bestBidRaw: 343_000n, bestAskRaw: 370_000n, ...bounds });
    expect(pair).not.toBeNull();
    expect(pair!.bidYesRaw).toBeLessThan(370_000n);
    expect(pair!.askYesRaw).toBeGreaterThan(343_000n);
    expect(pair!.askYesRaw - pair!.bidYesRaw).toBeGreaterThanOrEqual(20_000n);
  });
  it("widens to the vault's minimum spread when asked for less", () => {
    const pair = pairAround({ fairRaw: 500_000n, halfSpreadRaw: 2_000n, bestBidRaw: null, bestAskRaw: null, ...bounds });
    expect(pair!.askYesRaw - pair!.bidYesRaw).toBe(20_000n);
  });
  it("refuses a decided Window, and rests behind a tight inside rather than crossing it", () => {
    expect(pairAround({ fairRaw: 960_000n, halfSpreadRaw: 15_000n, bestBidRaw: null, bestAskRaw: null, ...bounds })).toBeNull();
    expect(pairAround({ fairRaw: 40_000n, halfSpreadRaw: 15_000n, bestBidRaw: null, bestAskRaw: null, ...bounds })).toBeNull();
    const behind = pairAround({ fairRaw: 500_000n, halfSpreadRaw: 15_000n, bestBidRaw: 495_000n, bestAskRaw: 505_000n, ...bounds });
    expect(behind).toEqual({ bidYesRaw: 485_000n, askYesRaw: 515_000n });
  });
});

describe("the grids", () => {
  it("fair, snapping and lots", () => {
    expect(fairYesRaw(400_000n, 420_000n, ONE)).toBe(410_000n);
    expect(fairYesRaw(null, 420_000n, ONE)).toBe(420_000n);
    expect(fairYesRaw(null, null, ONE)).toBe(500_000n);
    expect(snapDown(485_500n, TICK)).toBe(485_000n);
    expect(snapUp(485_500n, TICK)).toBe(486_000n);
    expect(snapUp(485_000n, TICK)).toBe(485_000n);
    expect(quantizeQuantity(5_500_000n, 1_000_000n, 1_000_000n)).toBe(5_000_000n);
    expect(quantizeQuantity(500_000n, 1_000_000n, 1_000_000n)).toBe(0n);
  });
  it("a quote expires before the Window when the actor's TTL is shorter", () => {
    expect(quoteExpiryNs(1_788_400_000, 1_788_400_300, 120)).toBe(1_788_400_120n * 1_000_000_000n);
    expect(quoteExpiryNs(1_788_400_000, 1_788_400_060, 120)).toBe(1_788_400_060n * 1_000_000_000n);
  });
});
