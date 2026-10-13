// The page's connection, pure (R6 shell S04/T05/T04): one state every notice reads — the browser's online flag, the
// read failure the chain or the indexer answered (rate-limited, down), when the next retry fires (2 → 4 → 8 → 16 →
// 30 s, ±20 %, never sooner than the RPC's own "try again in" hint), and the last time a read came back live. The
// strip (`components/shell/ConnectionStrip`) is a view of it: offline at once; a failure only after 1.5 s, so one blip
// never flashes; gone on the first success. Domain failures (a revert, not deployed) never enter it.
export type ConnectionKind = "rate-limited" | "rpc-down" | "indexer-down" | "ops-down";

export const CONNECTION_KINDS: ReadonlySet<string> = new Set<ConnectionKind>(["rate-limited", "rpc-down", "indexer-down", "ops-down"]);
export const isConnectionKind = (kind: string): kind is ConnectionKind => CONNECTION_KINDS.has(kind);

export interface Failing {
  kind: ConnectionKind;
  sinceMs: number;
  /** Retries fired so far. */
  attempt: number;
  nextRetryAtMs: number;
}

export interface ConnectionState {
  online: boolean;
  offlineSinceMs: number | null;
  failing: Failing | null;
  /** A retry is in flight. */
  retrying: boolean;
  lastLiveMs: number | null;
}

export const INITIAL: ConnectionState = { online: true, offlineSinceMs: null, failing: null, retrying: false, lastLiveMs: null };
export const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;
/** A failure shows only once it has lasted this long. */
export const SHOW_AFTER_MS = 1_500;

/** The wait before retry `attempt` (0-based); `jitter` in [-1, 1] spreads it ±20 %. */
export function backoffMs(attempt: number, jitter: number, hintMs = 0): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
  return Math.max(Math.round(base * (1 + 0.2 * Math.max(-1, Math.min(1, jitter)))), hintMs);
}

export function onFailure(s: ConnectionState, kind: ConnectionKind, nowMs: number, jitter: number, hintMs = 0): ConnectionState {
  if (s.failing) return { ...s, failing: { ...s.failing, kind }, retrying: false };
  return { ...s, retrying: false, failing: { kind, sinceMs: nowMs, attempt: 0, nextRetryAtMs: nowMs + backoffMs(0, jitter, hintMs) } };
}

/** The retry fires (on its timer or "Retry"): the next one is scheduled further out unless a read comes back first. */
export function onRetry(s: ConnectionState, nowMs: number, jitter: number): ConnectionState {
  if (!s.failing) return s;
  const attempt = s.failing.attempt + 1;
  return { ...s, retrying: true, failing: { ...s.failing, attempt, nextRetryAtMs: nowMs + backoffMs(attempt, jitter) } };
}

export function onSuccess(s: ConnectionState, nowMs: number): ConnectionState {
  if (!s.failing && !s.retrying && s.lastLiveMs !== null && nowMs - s.lastLiveMs < 1_000) return s;
  return { ...s, failing: null, retrying: false, lastLiveMs: nowMs };
}

export function onOnline(s: ConnectionState, online: boolean, nowMs: number): ConnectionState {
  if (online === s.online) return s;
  return online ? { ...s, online: true, offlineSinceMs: null } : { ...s, online: false, offlineSinceMs: nowMs, retrying: false };
}

export type StripView =
  | { state: "hidden" }
  | { state: "offline"; sinceMs: number }
  | { state: "reconnecting"; nextRetryAtMs: number; attempt: number }
  | { state: "retrying" };

export function stripView(s: ConnectionState, nowMs: number): StripView {
  if (!s.online) return { state: "offline", sinceMs: s.lastLiveMs ?? s.offlineSinceMs ?? nowMs };
  if (!s.failing || nowMs - s.failing.sinceMs < SHOW_AFTER_MS) return { state: "hidden" };
  if (s.retrying) return { state: "retrying" };
  return { state: "reconnecting", nextRetryAtMs: s.failing.nextRetryAtMs, attempt: s.failing.attempt };
}
