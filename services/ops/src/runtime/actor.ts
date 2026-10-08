// Ported from Agari 03b30abb:services/ops/src/runtime/actor.ts
/**
 * The loop every venue actor runs: one pass at a time, a structured why-string per pass, backoff
 * on failure, and a heartbeat either way. Identical consecutive whys are logged once a minute, so idle is a heartbeat,
 * never silence and never spam.
 */
import { errorText } from "./env";
import { registerHeartbeat, type Heartbeat } from "./heartbeat";

export type Log = (why: string) => void;

/** What one pass reports: the why-string, optional heartbeat detail, and when to run next (default `everyMs`). */
export type PassResult = { why: string; detail?: Record<string, unknown>; nextDelayMs?: number };

export interface ActorSpec {
  name: string;
  log: Log;
  dryRun: boolean;
  everyMs: number;
  pass: (beat: Heartbeat) => Promise<PassResult>;
  /** False: a stale or failing pass shows on `/health` without failing it (default true). */
  critical?: boolean;
}

const REPEAT_LOG_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `spec.pass` until `stop()`. Never throws. */
export function runActor(spec: ActorSpec): { stop: () => void; beat: Heartbeat } {
  const beat = registerHeartbeat(spec.name, spec.dryRun, spec.everyMs, spec.critical ?? true);
  let stopped = false;
  let lastLogged = { why: "", atMs: 0 };
  const say = (why: string) => {
    const now = Date.now();
    if (why === lastLogged.why && now - lastLogged.atMs < REPEAT_LOG_MS) return;
    lastLogged = { why, atMs: now };
    spec.log(why);
  };
  void (async () => {
    spec.log(spec.dryRun ? "start (DRY RUN: nothing is signed)" : "start");
    while (!stopped) {
      let delay = spec.everyMs;
      beat.passStartedMs = Date.now();
      try {
        const result = await spec.pass(beat);
        beat.lastOkMs = Date.now();
        beat.failures = 0;
        beat.lastWhy = result.why;
        if (result.detail) beat.detail = result.detail;
        say(result.why);
        delay = result.nextDelayMs ?? spec.everyMs;
      } catch (error) {
        beat.failures += 1;
        beat.lastWhy = `pass failed: ${errorText(error)}`;
        say(beat.lastWhy);
        delay = Math.min(spec.everyMs * 2 ** beat.failures, MAX_BACKOFF_MS);
      }
      beat.lastPassMs = Date.now();
      beat.passStartedMs = null;
      await sleep(Math.max(0, delay));
    }
  })();
  return { stop: () => void (stopped = true), beat };
}
