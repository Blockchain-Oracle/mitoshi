// Ported from Owarine ecb7565b:services/ops/src/http/coalesce.ts — unchanged but for this header.
/**
 * Per-key rate limit for a push stream: at most one send per key every `gapMs`, and the newest value always lands.
 * The first value after a quiet gap goes out at once; values inside the gap replace each other and the last one is sent
 * when the gap ends. So a Coinbase burst of 40 trades a second reaches a tab as ≤ 8 frames ending on the true last
 * price, and a quiet symbol costs nothing.
 */

export interface Coalescer<T> {
  push(key: string, value: T): void;
  /** Drops anything pending and its timers. */
  stop(): void;
}

export interface CoalesceClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: CoalesceClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createCoalescer<T>(send: (key: string, value: T) => void, gapMs: number, clock: CoalesceClock = realClock): Coalescer<T> {
  const lastSentMs = new Map<string, number>();
  const pending = new Map<string, T>();
  const timers = new Map<string, unknown>();
  let stopped = false;

  const flush = (key: string) => {
    timers.delete(key);
    if (stopped || !pending.has(key)) return;
    const value = pending.get(key) as T;
    pending.delete(key);
    lastSentMs.set(key, clock.now());
    send(key, value);
  };

  return {
    push(key, value) {
      if (stopped) return;
      const waitMs = (lastSentMs.get(key) ?? Number.NEGATIVE_INFINITY) + gapMs - clock.now();
      if (waitMs <= 0 && !timers.has(key)) {
        lastSentMs.set(key, clock.now());
        send(key, value);
        return;
      }
      pending.set(key, value);
      if (!timers.has(key)) timers.set(key, clock.setTimeout(() => flush(key), Math.max(0, waitMs)));
    },
    stop() {
      stopped = true;
      for (const h of timers.values()) clock.clearTimeout(h);
      timers.clear();
      pending.clear();
    },
  };
}
