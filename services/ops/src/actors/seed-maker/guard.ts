/**
 * The maker's divergence guard (S23a, D-196). The display feed (a Coinbase or Alpaca IEX trade) leads RedStone's 10 s
 * signed values, so a taker watching the exchange could lift a quote priced on a stale signed value. The display price
 * is read as a risk signal only — quotes stay priced on the signed spot:
 * - the pair is centred between the signed fair and the display-implied fair, its half spread widened by half their gap:
 *   the bid sits a normal half spread under the lower of the two and the ask a normal half spread over the higher, so
 *   neither is crossable at either fair while the side the gap doesn't threaten stays where it was (S23 found the
 *   first, symmetric version — both sides widened by the whole gap — left a 2¢ bid under a 23¢ ask near the line);
 * - a gap wider than `K_PULL` standard deviations of the move expected over the signed value's age (and wider than
 *   `BASIS_FLOOR_BPS`, the ordinary IEX-vs-consolidated or one-venue-vs-median basis) pulls the Window: one of the two
 *   feeds is wrong, and nothing is quoted until they agree.
 * A display quote older than `DISPLAY_FRESH_MS`, missing, or itself RedStone's (the feed's fallback) changes nothing. Floats only inside; integers out. Pure.
 */
import type { DisplayQuote } from "../../display/types";

export const DISPLAY_FRESH_MS = 5_000;
export const K_PULL = 6;
export const BASIS_FLOOR_BPS = 25;
/** The signed value's age is floored at one RedStone poll. */
export const MIN_LAG_SEC = 10;

export interface GuardInput {
  signedE8: bigint;
  /** The signed value's own publish time. */
  signedAtSec: number;
  display: DisplayQuote | null;
  nowMs: number;
  /** Annualised σ in bps, and the year its clock runs on (trading time for Regular, calendar time for 24/7). */
  sigmaBps: number;
  yearSec: number;
  /** The fair the maker quotes (on the signed spot) and the same model at another spot. */
  fairTicks: number;
  fairAt: (spotE8: bigint) => number;
  halfSpreadTicks: number;
}

export type Guard = { action: "quote"; fairTicks: number; halfSpreadTicks: number; note: string | null } | { action: "pull"; note: string };

export function divergenceGuard(i: GuardInput): Guard {
  const fast = i.display && i.display.source !== "redstone" && i.nowMs - i.display.atMs <= DISPLAY_FRESH_MS;
  if (!fast || !i.display || i.signedE8 <= 0n) return { action: "quote", fairTicks: i.fairTicks, halfSpreadTicks: i.halfSpreadTicks, note: null };
  const lagSec = Math.max(MIN_LAG_SEC, i.nowMs / 1000 - i.signedAtSec);
  const gap = Math.abs(Math.log(Number(i.display.priceE8) / Number(i.signedE8)));
  const expected = (i.sigmaBps / 10_000) * Math.sqrt(lagSec / i.yearSec);
  const gapBps = Math.round(gap * 10_000);
  if (gapBps > BASIS_FLOOR_BPS && gap > K_PULL * expected) {
    return { action: "pull", note: `display ${i.display.source} ${gapBps} bps off the signed value (> ${K_PULL}σ over ${Math.round(lagSec)} s)` };
  }
  const displayFair = i.fairAt(i.display.priceE8);
  if (displayFair === i.fairTicks) return { action: "quote", fairTicks: i.fairTicks, halfSpreadTicks: i.halfSpreadTicks, note: null };
  const lo = Math.min(displayFair, i.fairTicks);
  const hi = Math.max(displayFair, i.fairTicks);
  // Centre on the midpoint; half the gap more each side puts the bid at `lo − half` and the ask at `hi + half` (an odd gap
  // rounds the centre down and adds the lost tick to the half spread, so neither edge moves inside its fair).
  const mid = Math.floor((lo + hi) / 2);
  const half = i.halfSpreadTicks + Math.max(mid - lo, hi - mid);
  return { action: "quote", fairTicks: mid, halfSpreadTicks: half, note: `${lo}–${hi} on the display ${i.display.source} price` };
}
