// Ported from Masayume 68f7a09:packages/core/src/games/limits.ts
import type { ClientMessageType } from "./protocol";

/**
 * What a room accepts from one connection, as data both sides can read.
 *
 * The policy lives in core rather than in the server for one reason: a client that knows the limit can
 * stay inside it. A swipe stage that sends a `pick.pending` on every pointer move would otherwise learn
 * the rate only by being disconnected mid-match, and the player would experience a griefing defence as
 * a bug. The same table therefore throttles the browser and enforces the server.
 *
 * A token bucket rather than a fixed window: a burst is exactly what real use looks like — three
 * reactions when a card lands, then nothing for a minute — and a fixed window either refuses that burst
 * or permits twice the rate across a boundary.
 */

export interface RateRule {
  /** How many may arrive at once. */
  burst: number;
  /** The sustained rate, per second, once the burst is spent. */
  perSec: number;
}

export const ROOM_RATES: Readonly<Record<ClientMessageType, RateRule>> = {
  /** One at the start of a connection; a second only if the first was answered with a version error. */
  hello: { burst: 2, perSec: 0.1 },
  "queue.join": { burst: 3, perSec: 0.2 },
  "queue.leave": { burst: 3, perSec: 0.2 },
  /** One per pairing; a second only because a dropped socket may have to redo the ceremony. */
  "seed.reveal": { burst: 3, perSec: 0.2 },
  /** A swipe in progress: generous, because this one is per gesture rather than per action. */
  "pick.pending": { burst: 10, perSec: 2 },
  chat: { burst: 4, perSec: 0.5 },
  reaction: { burst: 6, perSec: 1 },
  /** A client that resyncs in a loop is a client that will resync a loop of snapshots out of the server. */
  resync: { burst: 3, perSec: 0.2 },
};

interface Bucket {
  tokens: number;
  atMs: number;
}

/** One connection's buckets. Created empty; each kind fills on first use, so an idle kind costs nothing. */
export type RateState = Map<ClientMessageType, Bucket>;

export function createRateState(): RateState {
  return new Map();
}

/**
 * Takes one token for `type`, or refuses. Refills from elapsed time rather than a timer, so a
 * connection that sat idle for an hour is not carrying an hour of credit — the burst is the ceiling.
 */
export function allowMessage(state: RateState, type: ClientMessageType, nowMs: number): boolean {
  const rule = ROOM_RATES[type];
  const bucket = state.get(type);
  if (!bucket) {
    state.set(type, { tokens: rule.burst - 1, atMs: nowMs });
    return true;
  }
  const refilled = Math.min(rule.burst, bucket.tokens + ((nowMs - bucket.atMs) / 1_000) * rule.perSec);
  bucket.atMs = nowMs;
  if (refilled < 1) {
    bucket.tokens = refilled;
    return false;
  }
  bucket.tokens = refilled - 1;
  return true;
}
