// Ported from Masayume 68f7a09:packages/core/src/games/picking.ts
import type { DeckCard } from "./types";

/**
 * When a card can be played, and what a swipe does when it loses a race. Both rules were measured
 * on Shannon during the first full duel (2026-09-03, `context/54`) rather than reasoned about, and
 * both are shared by the browser's stage and the operator's spikes so the two cannot disagree.
 */

/** Only the fields these rules read, spelled out — `Pick<>` would collide with the games' own `Pick`. */
type CardLife = { expirySec: number };
type LifeFloor = { minCardLifeSec: number };

/**
 * The arena's own entry gate, and the only one a duel card may be judged by.
 *
 * `_sizeEntry` requires the market to be TRADING and `expiry >= now + minCardLifeSec` — 240s at the
 * deployed parameters. The app also carries a client-side `phase()` buffer that calls a Window
 * unenterable for its last 300s, and that buffer is **wrong for a duel**: it is Yosuku's rule for an
 * ordinary resting order, whose reason (canon #6's dead-man's-switch expiry) does not apply to an
 * IOC whose expiry the arena caps itself. Measured live: at 278s of card life our `phase()` refused
 * while the arena quoted 11,000 raw. A stage that gated on `phase()` would refuse swipes the chain
 * would have taken.
 */
export function cardPlayable(card: CardLife, params: LifeFloor, nowSec: number): boolean {
  return card.expirySec - nowSec >= params.minCardLifeSec;
}

/** Seconds of playable life left on a card — zero once the arena would refuse it. Never negative. */
export function cardLifeLeftSec(card: CardLife, params: LifeFloor, nowSec: number): number {
  return Math.max(0, card.expirySec - params.minCardLifeSec - nowSec);
}

/**
 * The pick deadline a stage should count down to: the arena's own, or the moment the last card
 * stops being playable, whichever comes first.
 *
 * These are not the same clock, and the gap is the open decision in `context/54` §5:
 * `minCardLifeSec` is a floor checked at REVEAL while the pick window runs `pickWindowSec` after
 * it, so in the worst legal case a card is `TooLate` well before the player's clock runs out. Until
 * the deal headroom is widened, the honest countdown is the earlier of the two — a player who is
 * shown 120 seconds they cannot actually use has been told a false thing by the screen.
 */
export function pickWindowEndsSec(cards: readonly DeckCard[], params: LifeFloor, pickDeadlineSec: number): number {
  const lastPlayable = cards.reduce((soonest, card) => Math.min(soonest, card.expirySec - params.minCardLifeSec), Number.POSITIVE_INFINITY);
  return Number.isFinite(lastPlayable) ? Math.min(pickDeadlineSec, lastPlayable) : pickDeadlineSec;
}

/**
 * How many times one swipe may ask the chain before it is a real failure.
 *
 * Four, because the thing being retried is not an error: on a binary pool, buying UP and buying DOWN
 * draw on the same resting liquidity, so two seats swiping the same card in the same second contend,
 * and the loser's fill comes back under the floor it was quoted against. That is the normal case in
 * a live duel, and it is what cost the first drive its eighth pick.
 */
export const PICK_ATTEMPT_MAX = 4;

/** Attempts stop this long before the deadline rather than at it — a send in flight still has to land. */
export const PICK_ATTEMPT_GUARD_SEC = 3;

/**
 * The floor under the quote, loosening per attempt: 90% of the quoted size, then 70%, then 50%.
 *
 * The stake never changes, only the floor. The arena refunds whatever the walk does not spend, so a
 * smaller fill costs the player nothing — which is why loosening the floor is the right knob and
 * raising the stake would be the wrong one.
 */
export function pickFloorRaw(quantityRaw: bigint, attempt: number): bigint {
  const ladder = [9_000n, 7_000n, 5_000n];
  const bps = ladder[Math.min(Math.max(attempt, 1) - 1, ladder.length - 1)] as bigint;
  return (quantityRaw * bps) / 10_000n;
}
