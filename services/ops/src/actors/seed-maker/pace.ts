/**
 * The seed maker's pace (D-230). A trading Window waiting for its opening print gets quoted the moment the print lands,
 * so while one does the next pass comes in 2 s — but only within its first 30 s: the relay lands an open in a few
 * seconds and says a stall at 20 s, so past that the wait is RedStone's or the RPC's, can last a refusal window, and a
 * pass every 2 s (each re-reading every Window through the shared RPC budget) would only starve the relay and the
 * settler. Then the maker keeps its own cadence (`SEED_MAKER_REFRESH_MS`). A Window listed ahead of its start pulls
 * the next pass to its start plus the usual few seconds the open takes, so its book doesn't wait out a whole cadence.
 */
export const OPEN_WAIT_PASS_MS = 2_000;
export const OPEN_WAIT_FAST_SEC = 30;
/** RedStone signs T by T + 4 s and the relay lands it in a packed send: the first look at a new Window. */
export const FIRST_LOOK_AFTER_START_SEC = 4;

/**
 * When the next pass comes: 2 s while a Window started ≤ 30 s ago still waits for its open; else the first look at the
 * next Window to start, when that comes before `refreshMs`; else `refreshMs`.
 */
export function makerDelayMs(awaiting: readonly { tradingStartSec: number }[], nowSec: number, refreshMs: number, ahead: readonly { tradingStartSec: number }[] = []): number {
  if (awaiting.some((m) => nowSec >= m.tradingStartSec && nowSec - m.tradingStartSec <= OPEN_WAIT_FAST_SEC)) return Math.min(OPEN_WAIT_PASS_MS, refreshMs);
  const firstLook = Math.min(...ahead.filter((m) => m.tradingStartSec > nowSec).map((m) => (m.tradingStartSec + FIRST_LOOK_AFTER_START_SEC - nowSec) * 1000));
  return Math.max(OPEN_WAIT_PASS_MS, Math.min(refreshMs, firstLook));
}
