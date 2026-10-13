// Ported from Owarine 90a91d71:services/ops/src/actors/x-relay/search-pacer.ts — unchanged.
/**
 * Paces the mention reads inside X's own budget. X answers every read with `x-rate-limit-remaining` and
 * `x-rate-limit-reset` (epoch seconds) for a fifteen-minute window; polling faster than that budget allows locks the
 * read for the rest of the window. Spreading the calls left evenly over the time left keeps every mention's wait to one
 * interval.
 */
export interface SearchPacer {
  observe(headers: Record<string, unknown>, nowMs: number): void;
  limited(nowMs: number): void;
  readyAtMs(): number;
}

const FIRST_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;
/** X's reset second can land a moment before its counter does. */
const RESET_SLACK_MS = 1_000;

function header(headers: Record<string, unknown>, name: string): number | null {
  const value = Number(headers[name]);
  return Number.isFinite(value) ? value : null;
}

export function createSearchPacer(): SearchPacer {
  let resetMs: number | null = null;
  let readyAt = 0;
  let backoffMs = 0;
  return {
    observe(headers, nowMs) {
      backoffMs = 0;
      const remaining = header(headers, "x-rate-limit-remaining");
      const reset = header(headers, "x-rate-limit-reset");
      if (remaining === null || reset === null || reset * 1000 <= nowMs) {
        readyAt = 0;
        return;
      }
      resetMs = reset * 1000;
      readyAt = remaining <= 0 ? resetMs + RESET_SLACK_MS : nowMs + Math.ceil((resetMs - nowMs) / remaining);
    },
    limited(nowMs) {
      if (resetMs !== null && resetMs > nowMs) {
        readyAt = resetMs + RESET_SLACK_MS;
        return;
      }
      backoffMs = Math.min(backoffMs ? backoffMs * 2 : FIRST_BACKOFF_MS, MAX_BACKOFF_MS);
      readyAt = nowMs + backoffMs;
    },
    readyAtMs: () => readyAt,
  };
}
