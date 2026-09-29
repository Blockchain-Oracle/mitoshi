// Test fixtures shared by core, markets and web tests (replaces Agari 03b30ab:packages/core/src/testing/ids.ts, whose
// ids were base58 Solana keys).
import { toMarketId, type EventMarket, type MarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";

const hex = (n: number, bytes: number): string => n.toString(16).padStart(bytes * 2, "0");

export const testAddress = (n: number): Address => `0x${hex(n, 20)}` as Address;
export const testBytes32 = (n: number): Bytes32 => `0x${hex(n, 32)}` as Bytes32;
export const testMarketId = (n: number): MarketId => toMarketId(testBytes32(n));

/** A trading 5m TSLA Window starting at `startSec`; override anything. */
export function testMarket(overrides: Partial<EventMarket> = {}, startSec = 1_000_000): EventMarket {
  return {
    marketId: testMarketId(1),
    seriesId: testBytes32(0xabc),
    index: 1n,
    asset: "TSLA",
    lane: "regular",
    question: "TSLA up in 5m?",
    intervalSec: 300,
    tradingStartSec: startSec,
    lockAtSec: startSec + 300,
    expirySec: startSec + 300,
    policyVersion: 1,
    printSource: "redstone",
    singleSource: false,
    state: "open",
    status: "Trading",
    collateral: testAddress(0x20c0),
    decimals: 6,
    winningOutcome: null,
    voidReason: null,
    openingPriceRaw: 100_000_000n,
    volumeQuoteRaw: 0n,
    tradeCount: 0,
    lastPriceTicks: null,
    resolvedAtMs: null,
    ...overrides,
  };
}
