// R6 #9 (D-230): every strategy's decisions, not only an agent's. A rule (momentum, reversion) or a mirror calls a Window
// once — the first runner pass its trigger holds — and the runner records that call in the same decision log an agent's
// read lands in (`strategy_decisions`, model `rule/<preset>`), so each strategy's page counts and shows its real
// decisions: time, call, result. `RunnerBeat` is what one runner pass did for one strategy, as data the app words
// (strategies/0005); the heartbeat's `why` stays the ops log's line and is never shown raw.
import type { Side } from "../types/market";
import { shortTrader } from "./spec";
import type { Decision, StrategySpec } from "./types";

/** The `model` a rule's call is recorded under ("rule/reversion"); an agent's read records its provider/model. */
export const ruleModelOf = (preset: StrategySpec["preset"]): string => `rule/${preset}`;
export const isRuleModel = (model: string): boolean => model.startsWith("rule/");

const pct = (bps: number) => `${(Math.abs(bps) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * A rule's call in words, for the decision log: "ETH fell 0.08% from its opening print; it bets on a pullback." With
 * `moveBps` null (a call recovered from its fills, before calls were recorded) the side says which way the price ran
 * and the threshold says by at least how much.
 */
export function ruleCallWhy(spec: StrategySpec, asset: string | null, side: Side, moveBps: number | null): string {
  const name = asset ?? "The price";
  // A theme (D-231) calls each member's Window with its own rule's words.
  if (spec.preset === "basket") return ruleCallWhy(spec.rule, asset, side, moveBps);
  if (spec.preset === "mirror") return `${shortTrader(spec.trader)} is net ${side.toUpperCase()} on this Window; it takes the same side.`;
  if (spec.preset === "agent") return `It called ${side.toUpperCase()}.`;
  const rose = spec.preset === "momentum" ? side === "up" : side === "down";
  const by = moveBps === null ? `at least ${pct(spec.thresholdBps)}` : pct(moveBps);
  return `${name} ${rose ? "rose" : "fell"} ${by} from its opening print; ${spec.preset === "momentum" ? "it bets the move runs on" : "it bets on a pullback"}.`;
}

/** The ruling recorded beside a rule's call. */
export function ruleCallReason(spec: StrategySpec, decision: Pick<Decision, "side" | "moveBps" | "thresholdBps">): string {
  if (spec.preset === "basket") return ruleCallReason(spec.rule, decision);
  if (spec.preset === "mirror") return "the trader took a side";
  return `${pct(decision.moveBps)} move, past its ${pct(decision.thresholdBps)} trigger`;
}

/** Why a copier wasn't filled on a call — each kind the runner can name (strategy-runner `executeForSubscriber`). */
export type SkipKind = "budget" | "daily-cap" | "book" | "in-window" | "caps" | "late" | "grant" | "refused" | "other";
export const SKIP_KINDS: readonly SkipKind[] = ["budget", "daily-cap", "book", "in-window", "caps", "late", "grant", "refused", "other"];

/** Why a pass read nothing for a strategy. */
export type RunnerIdle = "closed" | "unreadable" | "no-copier" | "no-live-budget" | "no-brain" | "unconfirmed" | "error";
const IDLE: readonly RunnerIdle[] = ["closed", "unreadable", "no-copier", "no-live-budget", "no-brain", "unconfirmed", "error"];

/** One runner pass for one strategy. `copiers`: subscribers with a live budget. A scan read `windows` trading Windows
 *  of its series; a rule's nearest trigger is `closestBps` away; `calls` Windows had a side, `filled` copies landed,
 *  and the copiers it could not fill are tallied by reason (a copier already in the Window is not a skip). */
export type RunnerBeat =
  | { kind: "idle"; idle: RunnerIdle; copiers: number }
  | { kind: "scan"; copiers: number; windows: number; closestBps: number | null; calls: number; filled: number; skipped: Partial<Record<SkipKind, number>> };

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** The stored beat (jsonb, untrusted shape) or null. */
export function parseRunnerBeat(raw: unknown): RunnerBeat | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const copiers = count(r.copiers);
  if (copiers === null) return null;
  if (r.kind === "idle") return IDLE.includes(r.idle as RunnerIdle) ? { kind: "idle", idle: r.idle as RunnerIdle, copiers } : null;
  if (r.kind !== "scan") return null;
  const [windows, calls, filled] = [count(r.windows), count(r.calls), count(r.filled)];
  if (windows === null || calls === null || filled === null) return null;
  const closestBps = r.closestBps === null || r.closestBps === undefined ? null : count(r.closestBps);
  const skipped: Partial<Record<SkipKind, number>> = {};
  if (r.skipped && typeof r.skipped === "object") {
    for (const k of SKIP_KINDS) {
      const n = count((r.skipped as Record<string, unknown>)[k]);
      if (n) skipped[k] = n;
    }
  }
  return { kind: "scan", copiers, windows, closestBps, calls, filled, skipped };
}

/** The reason most copiers were skipped for, or null when none were. */
export function mainSkip(skipped: Partial<Record<SkipKind, number>>): SkipKind | null {
  let best: SkipKind | null = null;
  for (const k of SKIP_KINDS) if ((skipped[k] ?? 0) > (best ? (skipped[best] ?? 0) : 0)) best = k;
  return best;
}
