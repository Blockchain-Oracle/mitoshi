// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/http/health.ts
/** `GET /health`: every actor heartbeat; `ok` is false when one is failing (≥ 3 in a row) or silent for max(5 min, 3 × its loop). */
import { heartbeats } from "../runtime/heartbeat";
import type { OpsEnv } from "../runtime/env";

const SILENT_MS = 5 * 60_000;
const FAILING = 3;

export function healthBody(env: OpsEnv | undefined, nowMs = Date.now()) {
  const actors = heartbeats().map((a) => {
    const silent = nowMs - (a.lastOkMs ?? a.startedMs) > Math.max(SILENT_MS, 3 * a.everyMs);
    return { ...a, silent, failing: a.failures >= FAILING };
  });
  const ok = actors.every((a) => !a.silent && !a.failing);
  return { ok, network: env?.network ?? null, dryRun: env?.dryRun ?? null, nowMs, commit: process.env.SOURCE_COMMIT ?? process.env.GIT_SHA ?? null, actors };
}

/** JSON with bigints as decimal strings. */
export const jsonText = (value: unknown) => JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
