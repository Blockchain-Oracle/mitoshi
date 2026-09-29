// Ported from Masayume 68f7a09:packages/core/src/games/matchmaking.ts
import type { Address } from "../types/primitives";
import type { DuelMode, StakeTierId } from "./types";

/**
 * Queue keys and the widening rating search.
 *
 * The search widens with waiting rather than staying fixed, and compatibility uses the *wider* of two
 * players' bands, so a player who has waited two minutes can be matched by a newcomer who has not —
 * without that, long waits get longer, because the patient player is invisible to everyone arriving
 * after them (`reference/flicky/apps/server/src/ws/matchmaking.ts:171-237`).
 */

export const BASE_BAND = 100;
export const WIDEN_BY = 50;
export const WIDEN_EVERY_MS = 15_000;
export const MAX_BAND = 400;

export type Region = string;

/** Rooms never mix modes, tiers or regions: a Free player must not be paired into a staked pot. */
export function queueKey(mode: DuelMode, tier: StakeTierId, region: Region): string {
  return `${mode}:${tier}:${region}`;
}

export interface QueueEntry {
  wallet: Address;
  rating: number;
  queuedAtMs: number;
  connectionId: string;
  /** Published before the deck exists, so neither the server nor an opponent can choose after seeing it. */
  clientSeedCommitment: string;
}

/** ±100 at once, +50 every fifteen seconds, never past ±400. */
export function searchBand(waitedMs: number): number {
  if (waitedMs <= 0) return BASE_BAND;
  return Math.min(MAX_BAND, BASE_BAND + WIDEN_BY * Math.floor(waitedMs / WIDEN_EVERY_MS));
}

export function bandAt(entry: QueueEntry, nowMs: number): number {
  return searchBand(nowMs - entry.queuedAtMs);
}

export function isCompatible(a: QueueEntry, b: QueueEntry, nowMs: number): boolean {
  if (a.wallet === b.wallet) return false;
  const band = Math.max(bandAt(a, nowMs), bandAt(b, nowMs));
  return Math.abs(a.rating - b.rating) <= band;
}

/**
 * The opponent for `self` out of one queue: the compatible entry that has waited longest, so the queue
 * drains oldest-first rather than by rating proximity. Returns null when nobody is in band yet.
 */
export function findOpponent<T extends QueueEntry>(self: T, queue: readonly T[], nowMs: number): T | null {
  let best: T | null = null;
  for (const candidate of queue) {
    if (!isCompatible(self, candidate, nowMs)) continue;
    if (!best || candidate.queuedAtMs < best.queuedAtMs) best = candidate;
  }
  return best;
}
