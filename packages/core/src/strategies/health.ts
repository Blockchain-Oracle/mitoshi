// Ported from Masayume 68f7a09:packages/core/src/strategies/health.ts
import type { RunnerHealth } from "./types";

const MIN_ALIVE_WINDOW_MS = 180_000;
const INTERVALS_OF_GRACE = 3;

/**
 * Story 6.6: alive = now − lastTick < max(180 s, 3 × interval). A runner that has never ticked is
 * "never started", its own state — no health formula ever computes on a null tick. When the store
 * that holds heartbeats cannot be reached, the answer is "unknown", never alive.
 */
export function deriveRunnerHealth(input: { lastTickMs: number | null; intervalMs: number | null; why: string | null; nowMs: number; reachable: boolean }): RunnerHealth {
  const { lastTickMs, intervalMs, why, nowMs, reachable } = input;
  if (!reachable) return { kind: "unknown", lastTickMs, intervalMs, why };
  if (lastTickMs === null) return { kind: "never-started", lastTickMs: null, intervalMs, why: null };
  const grace = Math.max(MIN_ALIVE_WINDOW_MS, (intervalMs ?? 0) * INTERVALS_OF_GRACE);
  return { kind: nowMs - lastTickMs < grace ? "alive" : "stale", lastTickMs, intervalMs, why };
}
