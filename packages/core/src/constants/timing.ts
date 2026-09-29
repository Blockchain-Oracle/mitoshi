// Ported from Masayume 68f7a09:packages/core/src/constants/timing.ts
export const QUOTE_DEBOUNCE_MS = 350;
export const REQUOTE_MS = 12_000;
export const QUOTE_STALE_AFTER_MS = 20_000;

export const MARKETS_POLL_MS = 15_000;
export const PRICE_POLL_MS = 5_000;
export const ONCHAIN_POLL_MS = 5_000;
export const OPENING_PRINT_POLL_MS = 3_000;
export const VERDICT_POLL_MS = 3_000;
export const CLOCK_RESYNC_MS = 60_000;

/**
 * Settled history is an archive, not a live number: a Window that has closed does not reopen.
 * The expensive multi-page fill scan therefore revalidates slowly, and stays correct through
 * the three things that actually change it — a confirmed write, an account change, and the tab
 * regaining focus. Polling it on the market cadence put that scan in permanent competition with
 * the reads a portfolio is actually opened for.
 */
export const SETTLED_HISTORY_POLL_MS = 300_000;

/** Owner-approved 2026-09-10: all app entry lanes close 30 seconds before expiry. */
export const ENTRY_BUFFER_SEC = 30;

/** Countdown turns urgent at min(60, interval × 0.4) seconds (UX-DR14). */
export const URGENT_MAX_SEC = 60;
export const URGENT_FRACTION = 0.4;

/** Windows are back-to-back within a lane (next tradingStart == previous expiry); a gap > 0 is a skipped window, not a schedule. */
export const ROLL_GAP_SEC = 0;

/** A price tick older than this is shown frozen with a staleness tick, never as live. */
export const PRICE_STALE_AFTER_MS = 15_000;

/** Bootstrap partials read a few seconds short of their series cadence; snap within this tolerance so they don't create phantom lanes. */
export const CADENCE_SNAP_TOLERANCE_SEC = 5;
