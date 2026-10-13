/**
 * What the Lucky routes say, typed once for both ends (R4-9, D-227; ported from Masayume 68f7a09
 * web/src/features/games/lucky/lucky-wire.ts). Money is a decimal string in base units on the wire; nothing is a float.
 */
import type { Bytes32, Hex, MarketId, Side } from "@cwf/core";
import type { LuckyRowResult } from "@cwf/db";

export interface LuckyCommitWire {
  drawId: Bytes32;
  commitment: Bytes32;
  nonce: number;
  policyVersion: number;
  stakeBase: string;
}

export interface LuckyDealWire {
  drawId: Bytes32;
  nonce: number;
  policyVersion: number;
  stakeBase: string;
  commitment: Bytes32;
  serverSeed: Bytes32;
  clientSeed: Bytes32;
  /** The policy's universes, so the browser's check replays the same mapping. */
  assets: readonly string[];
  multipliers: readonly number[];
  draw: { asset: string; side: Side; multiplier: number };
  candidateHash: Bytes32;
  candidateCount: number;
  /** The dealt Window; the browser finds it in its own live lanes and places on its own live quote. */
  marketId: string | null;
  /** The server's quote at the reveal, for the "dealt at" line; never what is placed. */
  dealtAvgPriceBps: number | null;
  result: "drawn" | "refused";
  refusal: string | null;
}

export interface LuckyRowWire {
  drawId: Bytes32;
  nonce: number;
  asset: string | null;
  side: Side | null;
  multiplier: number | null;
  marketId: MarketId | null;
  txHash: Hex | null;
  stakeBase: string;
  costBase: string | null;
  result: LuckyRowResult;
  refusal: string | null;
  createdAt: string;
}

export interface LuckyHistoryWire {
  configured: boolean;
  rows: LuckyRowWire[];
  /** Consecutive settled wins from the newest, and the longest run (core `luckyStreak` / `luckyBestStreak`). */
  streak: number;
  best: number;
}

export interface LuckyBoardWire {
  configured: boolean;
  rows: { wallet: string; streak: number; best: number; draws: number }[];
}
