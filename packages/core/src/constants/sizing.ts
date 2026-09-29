// Ported from Masayume 68f7a09:packages/core/src/constants/sizing.ts
export const BPS_DENOMINATOR = 10_000;

/** Client admissibility band for entering a position, inclusive at both edges (PRD FR-8). */
export const ADMISSIBLE_MIN_BPS = 200;
export const ADMISSIBLE_MAX_BPS = 9_700;

/** The venue's own price band; prices are always clamped inside it before they reach a book. */
export const VENUE_MIN_BPS = 100;
export const VENUE_MAX_BPS = 9_900;

/**
 * Cost-cap buffer over the fresh quote, interpolated by cadence and clamped at both anchors (PRD addendum §F).
 * Applied as a limit-price cushion, so it trades size for a locked max loss: a $10 stake at 50¢ on a 60 s lane
 * buys 12.5 contracts, not 20, and can never cost more than the $10 escrowed.
 */
export const COST_CAP_ANCHORS = {
  fromSec: 60,
  fromBufferBps: 16_000,
  toSec: 3_600,
  toBufferBps: 11_000,
} as const;

/** Minimum stake in whole collateral units. */
export const MIN_STAKE_UNITS = 1n;

/** Quick-amount chips as fractions of the spendable balance. */
export const CHIP_FRACTIONS = [
  { label: "¼", numerator: 1n, denominator: 4n },
  { label: "½", numerator: 1n, denominator: 2n },
  { label: "¾", numerator: 3n, denominator: 4n },
  { label: "Max", numerator: 1n, denominator: 1n },
] as const;

/** Extra ticks of crossing cushion on top of the bps buffer when converting a stake into a limit. */
export const SLIPPAGE_MIN_TICKS = 10n;
