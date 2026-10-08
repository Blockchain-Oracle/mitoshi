// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/market-maker/seat/quote.ts
/**
 * Quote math for the seat-mode seed maker (venue-ops.md §8.2–8.3). Pure and integer: YES ticks, lots and base units.
 *
 * The book is YES-quoted (events-engine.md §2). The bid is a PostOnly BUY_YES at `bid`; the ask is a PostOnly BUY_NO
 * at YES price `ask`, which escrows `1000 − ask` per lot and fills through the mint-pair path, so the maker never needs
 * inventory to offer YES.
 */

export type QuotePair = { bidTicks: number | null; askTicks: number | null };

export interface PairInput {
  fairTicks: number;
  halfSpreadTicks: number;
  minTick: number;
  bestBidTicks: number | null;
  bestAskTicks: number | null;
  /** Limit quotes (`MM_ORDER_TYPE=limit`) keep their price and take what rests inside it (D-090). */
  crossing?: boolean;
}

/**
 * Bid `fair − half`, ask `fair + half`. A side that would fall past the edge is pinned to the edge
 * (`minTick` / `1000 − minTick`) while it stays on its own side of fair, so a lopsided Window still offers both Up and
 * Down (S23: a 24/7 book at fair 20–50 showed "no book" on one side all night). At fair = the edge the pinned side
 * quotes at fair: a No buyer pays 98¢ for a 98 % Window, which is the price, and the book is never one-sided.
 * A PostOnly pair is pulled strictly inside the opposite best, because a crossing PostOnly order is refused. A limit
 * pair stays where fair says: it takes any resting order on its side, at that order's price, which is how a user's
 * pre-open call gets filled at the bell.
 */
export function quotePair(i: PairInput): QuotePair {
  let bid = i.fairTicks - i.halfSpreadTicks;
  let ask = i.fairTicks + i.halfSpreadTicks;
  if (!i.crossing && i.bestAskTicks !== null && bid >= i.bestAskTicks) bid = i.bestAskTicks - 1;
  if (!i.crossing && i.bestBidTicks !== null && ask <= i.bestBidTicks) ask = i.bestBidTicks + 1;
  if (bid < i.minTick && i.fairTicks >= i.minTick) bid = i.minTick;
  if (ask > 1000 - i.minTick && i.fairTicks <= 1000 - i.minTick) ask = 1000 - i.minTick;
  const inRange = (t: number) => t >= i.minTick && t <= 1000 - i.minTick;
  const bidTicks = inRange(bid) ? bid : null;
  let askTicks = inRange(ask) ? ask : null;
  if (bidTicks !== null && askTicks !== null && askTicks <= bidTicks) askTicks = null;
  return { bidTicks, askTicks };
}

/** Cash a resting BUY_YES at `bidTicks` escrows per lot (cash unit `cu`). */
export const bidEscrowPerLot = (bidTicks: number, cu: bigint) => BigInt(bidTicks) * cu;
/** Cash a resting BUY_NO at YES price `askTicks` escrows per lot: the NO price, `1000 − ask`. */
export const askEscrowPerLot = (askTicks: number, cu: bigint) => BigInt(1000 - askTicks) * cu;

/** Lots per side: `wantLots`, cut so both sides together stay inside `budget`; 0 when that falls below `minLots`. */
export function sizeLots(i: { wantLots: bigint; pair: QuotePair; cu: bigint; budget: bigint; minLots: bigint }): bigint {
  const perLot = (i.pair.bidTicks !== null ? bidEscrowPerLot(i.pair.bidTicks, i.cu) : 0n) + (i.pair.askTicks !== null ? askEscrowPerLot(i.pair.askTicks, i.cu) : 0n);
  if (perLot === 0n) return 0n;
  const affordable = i.budget / perLot;
  const lots = affordable < i.wantLots ? affordable : i.wantLots;
  return lots >= i.minLots ? lots : 0n;
}

/** A quote lives `ttl` seconds but never past 30 s before lock (entry closes there, D-011). */
export const quoteExpirySec = (nowSec: number, lockAtSec: number, ttlSec: number) => Math.min(nowSec + ttlSec, lockAtSec - 30);

export type Placed = { fairTicks: number; expireSec: number; halfSpreadTicks?: number };

/**
 * Requote when nothing rests, the fair moved `requoteTicks` or more, the half spread must widen (the divergence guard:
 * a resting pair narrower than the guard asks is the pair a taker would pick off), or the resting pair is within 20 s
 * of expiring.
 */
export function needsRequote(i: { placed: Placed | null; fairTicks: number; nowSec: number; requoteTicks: number; halfSpreadTicks?: number; lockAtSec?: number }): boolean {
  if (!i.placed) return true;
  if (Math.abs(i.fairTicks - i.placed.fairTicks) >= i.requoteTicks) return true;
  if (i.halfSpreadTicks !== undefined && i.halfSpreadTicks > (i.placed.halfSpreadTicks ?? 0)) return true;
  // A pair already resting to lock − 30 can't be refreshed past it: requoting would churn (fee, gap) for nothing.
  if (i.lockAtSec !== undefined && i.placed.expireSec >= i.lockAtSec - 30) return false;
  return i.placed.expireSec - i.nowSec <= 20;
}

export type MakerPhase = "quote" | "stop" | "pull";

/**
 * `pull`: out of session, halted, stale spot, or within 120 s of the close: cancel everything.
 * `stop`: within `STOP_BEFORE_LOCK_SEC` of the Window's lock: quote no more (what rests expires by lock − 30 on its own).
 * Otherwise `quote` — from `TAIL_FROM_LOCK_SEC` the exit tail (`inExitTail`).
 */
export function makerPhase(i: { nowSec: number; lockAtSec: number; inSession: boolean; closesAtSec: number | null; spotFresh: boolean }): MakerPhase {
  if (!i.inSession || !i.spotFresh) return "pull";
  if (i.closesAtSec !== null && i.nowSec >= i.closesAtSec - 120) return "pull";
  if (i.nowSec >= i.lockAtSec - STOP_BEFORE_LOCK_SEC) return "stop";
  return "quote";
}

/**
 * A quote expires at lock − 30 (`quoteExpirySec`, D-011). Through the paced send lane after a boot, with 28 books
 * re-quoting at once, the engine answered `OrderAlreadyExpired` (6107) for the 5m Windows' last placements on
 * 2026-09-22 — a fee paid to rest nothing — so the full book stopped at lock − 75. D-194 (S24.4, brought forward by the
 * terminal's first trades, F-S23-04): a position must still be sellable in the Window's last minute, so from
 * lock − 75 the house keeps both sides in an **exit tail** — half the size at twice the spread, each placement living
 * at least 15 s — and stops at lock − 45. Both orders stay: in this engine each one serves one side's exit (the YES bid
 * takes an Up holder's sale, the NO bid a Down holder's).
 */
export const TAIL_FROM_LOCK_SEC = 75;
export const STOP_BEFORE_LOCK_SEC = 45;
/** A placement that would rest less than this is skipped: a pass runs for tens of seconds after the clock it read. */
export const MIN_ORDER_LIFE_SEC = 8;
/** The tail's spread: twice the half spread, at least 30 ticks more. Its size: half the lots, at least the minimum. */
export const tailHalfSpread = (half: number) => Math.max(half * 2, half + 30);
export const tailLots = (lots: bigint, minLots: bigint) => (lots / 2n > minLots ? lots / 2n : minLots);

/** Inside the exit tail: the last stretch before the stop, when the house quotes small and wide for the exits. */
export const inExitTail = (nowSec: number, lockAtSec: number) => nowSec >= lockAtSec - TAIL_FROM_LOCK_SEC && nowSec < lockAtSec - STOP_BEFORE_LOCK_SEC;
