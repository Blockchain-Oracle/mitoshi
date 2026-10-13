/**
 * Pacing under the indexer key's rate limit (R6, D-230). The Tempo API counts requests per key and scope in fixed
 * windows and says so in `RateLimit-Limit/Remaining/Reset` (measured 2026-10-13 on the owner's sandbox key: 20 per
 * minute, scope `indexer:query`); over the limit it answers 429 with `Retry-After` (docs: api/rate-limits). The live
 * recount fired 46 coverage queries back to back and died on `Status: 429`, because tidx.ts retries after 200 and
 * 400 ms whatever the server asks.
 *
 * Every query goes through `run`: a minimum spacing between requests (the limit holds even when headers are missing),
 * a pause until the window resets once `Remaining` is down to the reserve left for other readers of the key, and on a
 * 429 the server's `Retry-After` (or the window reset), never less than an exponential floor, plus jitter. A wait longer
 * than `maxWaitMs` is not slept inside a pass: `IndexerRateLimitError` carries it to the caller, which schedules the
 * next pass instead. 408/5xx and dropped connections are retried twice with backoff.
 */

/** What a response said about the key's quota (any field may be missing: cached answers omit them). */
export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  /** When the window resets, Unix seconds. */
  resetSec: number | null;
  scope: string | null;
}

type HeaderBag = { get(name: string): string | null };

const int = (v: string | null): number | null => (v !== null && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

export function rateLimitFromHeaders(headers: HeaderBag): RateLimitInfo | null {
  const info = { limit: int(headers.get("ratelimit-limit")), remaining: int(headers.get("ratelimit-remaining")), resetSec: int(headers.get("ratelimit-reset")), scope: headers.get("ratelimit-scope") };
  return info.limit === null && info.remaining === null && info.resetSec === null ? null : info;
}

/** `Retry-After` as milliseconds from now: delta seconds or an HTTP date. */
export function retryAfterMsFrom(headers: HeaderBag, nowMs: number): number | null {
  const raw = headers.get("retry-after")?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
}

/** The key is over its limit for longer than a pass should sleep: run again after `retryAfterMs`. */
export class IndexerRateLimitError extends Error {
  override readonly name = "IndexerRateLimitError";
  constructor(readonly retryAfterMs: number, readonly limit: number | null) {
    super(`the indexer key is rate-limited${limit ? ` (${limit} per window)` : ""}; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

/** The shape of a failed query the pacer can read (IndexerQueryError has it). */
interface QueryFailure {
  status?: number | null;
  retryAfterMs?: number | null;
  rate?: RateLimitInfo | null;
}

export interface PacerOptions {
  /** Least time between two request starts (default 3,500 ms: 17 a minute, under the sandbox key's 20). */
  minIntervalMs?: number;
  /** Requests of each window left to other readers of the key: at or below it, wait for the reset (default 2). */
  reserve?: number;
  /** 429 retries per query (default 4). */
  maxRetries?: number;
  /** 408/5xx/network retries per query (default 2). */
  transientRetries?: number;
  /** The longest single wait inside a pass; a longer one throws `IndexerRateLimitError` (default 65 s). */
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface PacerStats {
  requests: number;
  /** 429 answers seen. */
  limited: number;
  retries: number;
  waits: number;
  waitedMs: number;
  last: RateLimitInfo | null;
}

export interface IndexerPacer {
  run<T>(request: () => Promise<T>): Promise<T>;
  /** Record the quota a response reported (the client calls it on every answer, success or not). */
  observe(info: RateLimitInfo | null): void;
  stats(): PacerStats;
}

const JITTER_MS = 250;

export function createIndexerPacer(options: PacerOptions = {}): IndexerPacer {
  const minIntervalMs = options.minIntervalMs ?? 3_500;
  const reserve = options.reserve ?? 2;
  const maxRetries = options.maxRetries ?? 4;
  const transientRetries = options.transientRetries ?? 2;
  const maxWaitMs = options.maxWaitMs ?? 65_000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const stats: PacerStats = { requests: 0, limited: 0, retries: 0, waits: 0, waitedMs: 0, last: null };
  let lastStartMs = Number.NEGATIVE_INFINITY;
  /** Serialises requests: spacing is between starts, so two callers never both pass the gate at once. */
  let queue: Promise<unknown> = Promise.resolve();

  const wait = async (ms: number) => {
    if (ms <= 0) return;
    if (ms > maxWaitMs) throw new IndexerRateLimitError(ms, stats.last?.limit ?? null);
    stats.waits++;
    stats.waitedMs += ms;
    await sleep(ms);
  };

  /** How long until the next request may start. Right after a 429's wait, its `Retry-After` stands in for the reset. */
  const gateMs = (afterRetryAfter: boolean): number => {
    const t = now();
    let ms = lastStartMs + minIntervalMs - t;
    const last = stats.last;
    if (!afterRetryAfter && last?.remaining !== null && last?.remaining !== undefined && last.remaining <= reserve && last.resetSec !== null) {
      const untilReset = last.resetSec * 1000 - t;
      if (untilReset > 0) ms = Math.max(ms, untilReset + Math.floor(random() * JITTER_MS));
    }
    return ms;
  };

  const attempt = async <T>(request: () => Promise<T>): Promise<T> => {
    for (let limited = 0, transient = 0, waited = false; ; ) {
      await wait(gateMs(waited));
      waited = false;
      lastStartMs = now();
      stats.requests++;
      try {
        return await request();
      } catch (error) {
        const failure = (error ?? {}) as QueryFailure;
        if (failure.rate) stats.last = failure.rate;
        const status = typeof failure.status === "number" ? failure.status : null;
        if (status === 429) {
          stats.limited++;
          if (limited >= maxRetries) throw new IndexerRateLimitError(failure.retryAfterMs ?? 60_000, stats.last?.limit ?? null);
          const reset = stats.last?.resetSec ? stats.last.resetSec * 1000 - now() : 0;
          const asked = failure.retryAfterMs ?? reset;
          const ms = Math.max(asked, 2 ** limited * 1000) + Math.floor(random() * JITTER_MS);
          limited++;
          stats.retries++;
          await wait(ms);
          waited = true;
          continue;
        }
        const transientFailure = status === 408 || (status !== null && status >= 500) || (status === null && isNetworkError(error));
        if (transientFailure && transient < transientRetries) {
          stats.retries++;
          await wait(2 ** transient++ * 1000 + Math.floor(random() * JITTER_MS));
          continue;
        }
        throw error;
      }
    }
  };

  return {
    run<T>(request: () => Promise<T>): Promise<T> {
      const next = queue.then(() => attempt(request));
      queue = next.catch(() => undefined);
      return next;
    },
    observe(info) {
      if (info) stats.last = info;
    },
    stats: () => ({ ...stats, last: stats.last ? { ...stats.last } : null }),
  };
}

const NETWORK = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network error|other side closed|terminated/i;

function isNetworkError(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 6; e = (e as { cause?: unknown }).cause, depth++) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && NETWORK.test(message)) return true;
  }
  return false;
}
