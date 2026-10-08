// Ported from Agari 03b30abb:services/ops/src/runtime/heartbeat.ts
/** In-process actor heartbeats: what `/health` serves and what the soak watches. */
export interface Heartbeat {
  actor: string;
  dryRun: boolean;
  /** The actor's loop interval: `/health` calls it silent after `max(5 min, 3 × everyMs)` without a good pass. */
  everyMs: number;
  startedMs: number;
  lastPassMs: number | null;
  /** When the running pass started; null between passes. The main watchdog exits the process on a stuck pass. */
  passStartedMs: number | null;
  lastOkMs: number | null;
  lastWhy: string;
  /** Consecutive failed passes. */
  failures: number;
  /** Actor-specific counters and lane states (e.g. paused lanes, lag). JSON-safe values only. */
  detail: Record<string, unknown>;
  /** False for display-only loops (the chart's exchange feed, S23a): reported, but never what fails `/health`. */
  critical: boolean;
}

const beats = new Map<string, Heartbeat>();

export function registerHeartbeat(actor: string, dryRun: boolean, everyMs = 0, critical = true): Heartbeat {
  const beat: Heartbeat = { actor, dryRun, everyMs, startedMs: Date.now(), lastPassMs: null, passStartedMs: null, lastOkMs: null, lastWhy: "starting", failures: 0, detail: {}, critical };
  beats.set(actor, beat);
  return beat;
}

export const heartbeats = (): Heartbeat[] => [...beats.values()];
