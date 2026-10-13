// The runner's last pass for one strategy in words (R6 #9, D-230): "Watching BTC 5m — 3 bps from its trigger",
// "Called · copiers out of budget", "Waiting for its first copier". Read from the pass as data (`health.state`, the
// runner's RunnerBeat), never from its log line, which stays in ops. Pure; the cockpit, the desk and the cards share it.
import { mainSkip, shortTrader } from "@cwf/core";
import type { DotTone } from "@/components/kit/desk-kit";
import { ago } from "../strategies/names";
import type { StrategyWire } from "../strategies/protocol";
import { AGENTS } from "./copy";

const P = AGENTS.pulse;

export interface Pulse {
  tone: DotTone;
  line: string;
  /** False when the runner is not deciding at all (closed, no copier, no live budget, no model, quiet): a countdown to
   *  a decision would be a promise it can't keep. */
  deciding: boolean;
}

export function pulseOf(s: Pick<StrategyWire, "active" | "health" | "spec" | "envelope">, nowMs: number): Pulse {
  const label = s.envelope.seriesLabel ?? P.anyWindow;
  const h = s.health;
  if (!s.active) return { tone: "stopped", line: P.closed, deciding: false };
  if (h.kind === "never-started") return { tone: "quiet", line: P.notStarted, deciding: false };
  if (h.kind === "stale" || h.kind === "unknown") return { tone: "warn", line: P.quiet(ago(h.lastTickMs ?? 0, nowMs)), deciding: false };
  const st = h.state;
  if (!st) return { tone: "live", line: P.running, deciding: true };
  if (st.kind === "idle") return { tone: st.idle === "no-copier" ? "quiet" : st.idle === "unconfirmed" ? "live" : "warn", line: P[st.idle], deciding: st.idle === "unconfirmed" };
  if (st.windows === 0) return { tone: "quiet", line: P.noWindow(label), deciding: true };
  if (st.calls > 0) {
    const skip = mainSkip(st.skipped);
    if (skip) return { tone: skip === "late" ? "quiet" : "warn", line: P.skip[skip] ?? P.skip.other!, deciding: true };
    return { tone: "live", line: st.filled > 0 ? P.filled(st.filled) : P.in, deciding: true };
  }
  const spec = s.spec;
  if (spec?.preset === "mirror") return { tone: "live", line: P.trader(shortTrader(spec.trader), label), deciding: true };
  if ((spec?.preset === "momentum" || spec?.preset === "reversion") && st.closestBps !== null) return { tone: "live", line: P.trigger(label, st.closestBps), deciding: true };
  return { tone: "live", line: P.watching(label), deciding: true };
}
