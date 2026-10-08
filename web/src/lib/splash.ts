// Ported from Owarine ecb7565b:web/src/lib/splash.ts — unchanged but for this header.
/**
 * The splash's end, for whoever waits on it (Tradash's `markSplashDone` / `subscribeToSplash`): the trading chart starts
 * its draw loop only once the splash has gone, so its first frames aren't spent under a cover.
 */
let done = false;
const waiting = new Set<() => void>();

export function markSplashDone(): void {
  if (done) return;
  done = true;
  for (const run of waiting) run();
  waiting.clear();
}

/** Runs `run` once the splash is done (now, if it already is); returns a cancel. */
export function whenSplashDone(run: () => void): () => void {
  if (done) {
    run();
    return () => undefined;
  }
  waiting.add(run);
  return () => waiting.delete(run);
}
