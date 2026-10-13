// Ported from Masayume 68f7a09:services/ops/src/actors/strategy-runner/agent.ts — the context is Tempo's: the Window's
// opening print and the RedStone spot it settles on (samples from the process's spot history, an EMA over them), both
// books quoted at the envelope's stake; the read is reserved in the store before the call and MPP receipts, when the
// model is paid on Tempo, are scoped to the decision (`decisionIdOf`).
import { decideAgentWindow, missingCredentialHint, promptHashOf, resolveModel, type ResolvedModel } from "@cwf/brain";
import { agentPrompt, decisionIdOf, decisionSlot, formatCadence, gateAgentVerdict, isRuleModel, type AgentSpec, type VaultCaps } from "@cwf/core";
import { insertMppReceipt, type Sql, type StrategyStore } from "@cwf/db";
import type { IndexedStrategy } from "@cwf/db/idx";
import { type RunnerWindow, type YesBook } from "@cwf/markets/ops";
import { agentContextOf, samplesOf } from "@cwf/markets/strategies";
import { mppPayerFromEnv, withReceiptScope } from "@cwf/markets/server";
import { readAgentRecord, type SettlementReader } from "./agent-record";
import type { Scan } from "./decide";

const HOUR_MS = 3_600_000;

/** The brain and the call budget the agent scan carries between cycles. */
export interface AgentState {
  brain: ResolvedModel | null;
  /** Which variable would switch the brain on — the heartbeat names it. Never a key. */
  missing: string;
  callsAtMs: number[];
  maxPerHour: number;
  timeoutMs: number;
}

/** `AGENT_VIA=mpp` pays each read on Tempo through the MPP payer (mainnet after Q-020); otherwise the key routes. */
export function createAgentState(sql: Sql | null, env: NodeJS.ProcessEnv = process.env): AgentState {
  const maxPerHour = Number(env.AGENT_MAX_CALLS_PER_HOUR) >= 1 ? Math.floor(Number(env.AGENT_MAX_CALLS_PER_HOUR)) : 60;
  const timeoutMs = Number(env.AGENT_TIMEOUT_MS) >= 1_000 ? Math.floor(Number(env.AGENT_TIMEOUT_MS)) : 20_000;
  if (env.AGENT_VIA?.trim() === "mpp") {
    const p = mppPayerFromEnv(sql ? (row) => insertMppReceipt(sql, row).then(() => undefined) : undefined, env);
    const brain = p.payer ? resolveModel({ via: "mpp", fetch: p.payer.fetch as typeof globalThis.fetch }) : null;
    return { brain, missing: p.payer ? missingCredentialHint({ via: "mpp" }) : p.reason, callsAtMs: [], maxPerHour, timeoutMs };
  }
  return { brain: resolveModel(), missing: missingCredentialHint(), callsAtMs: [], maxPerHour, timeoutMs };
}

export function agentBootLine(state: AgentState): string {
  return state.brain ? `agent brain: ${state.brain.providerName}/${state.brain.modelId} via ${state.brain.via}; ${state.maxPerHour} reads/h, ${state.timeoutMs} ms each` : `agent brain not configured: set ${state.missing}`;
}

/** The sliding hour's reads survive a restart: they are rows. */
export async function warmAgentState(state: AgentState, store: StrategyStore, nowMs: number): Promise<void> {
  const rows = await store.listDecisions(null, 500, true);
  // Only model reads spend the budget; a rule's recorded call (`rule/<preset>`) costs nothing.
  state.callsAtMs = rows.filter((r) => !isRuleModel(r.model)).map((r) => r.decidedAtMs).filter((at) => nowMs - at < HOUR_MS);
}

/** Up to 12 spot points across the Window so far, and an EMA over them (moved to @cwf/markets/strategies, R4-6). */
export { samplesOf };

export interface AgentScanDeps {
  /** The rested books of these Windows (one multicall on the lens). */
  books(marketIds: readonly `0x${string}`[]): Promise<Map<string, YesBook | null>>;
  /** Settlement facts per Window, cached for the cycle. */
  settlementOf: SettlementReader;
  store: StrategyStore;
  runner: string;
  dryRun: boolean;
  agent: AgentState;
  spot: { latest(symbol: string): { priceE8: bigint } | null; at(symbol: string, sec: number, windowSec: number): { priceE8: bigint } | null };
  log: (why: string) => void;
}

/**
 * One read of an agent strategy's Windows: each trading Window on one of its cadences, inside its decision slot and not
 * yet read, costs one model call under the hourly budget and writes one decision row — reserved before the call, so a
 * restart never asks twice. The same `Scan` shape as the house model's; the model never touches signing.
 */
export async function scanAgent(deps: AgentScanDeps, s: IndexedStrategy, spec: AgentSpec, windows: readonly RunnerWindow[], nowMs: number): Promise<Scan> {
  const { agent, store } = deps;
  const id = BigInt(s.strategyId);
  if (!agent.brain) return { candidates: [], scanned: 0, closestBps: null, why: `agent brain not configured — set ${agent.missing} on the runner; holding`, idle: "no-brain" };
  const brain = agent.brain;
  const nowSec = Math.floor(nowMs / 1000);
  const mine = windows.filter((w) => spec.cadences.includes(w.cadenceSec));
  const envelope: VaultCaps = { maxStakePerTradeBase: BigInt(s.maxStakePerTradeBase), maxDailySpendBase: BigInt(s.maxDailySpendBase), maxOpenPositions: s.maxOpenPositions, maxPriceRaw: BigInt(s.maxPriceRaw), market: null };
  const candidates: Scan["candidates"] = [];
  const notes: string[] = [];
  let reads = 0;
  const books = await deps.books(mine.map((w) => w.marketId));
  for (const w of mine) {
    const label = `${w.spotSymbol}/${formatCadence(w.cadenceSec)}`;
    const slot = decisionSlot({ tradingStartSec: w.tradingStartSec, expirySec: w.expirySec, intervalSec: w.cadenceSec }, nowMs);
    const previous = await store.decisionOf(s.strategyId, w.marketId, deps.dryRun);
    const symbol = w.spotSymbol;
    const book = books.get(w.marketId.toLowerCase()) ?? null;
    const spot = symbol ? { latest: () => deps.spot.latest(symbol), at: (sec: number, win: number) => deps.spot.at(symbol, sec, win) } : null;
    const context = agentContextOf({ window: w, spot, book, stakeBase: envelope.maxStakePerTradeBase, nowMs });
    if (!context) {
      notes.push(`${label}: no fresh spot; holding`);
      continue;
    }
    const record = await readAgentRecord(store, id, nowSec, deps.dryRun, deps.settlementOf);
    if (previous) {
      // A held or failed read stays held for its Window; a recorded trade is re-gated on today's figures and may resume.
      if (previous.gate !== "trade" || !previous.side) {
        notes.push(`${label}: ${previous.gateReason}`);
        continue;
      }
      const verdict = previous.verdictSide === "none" || previous.confidence === null ? null : { side: previous.verdictSide, confidence: previous.confidence, why: previous.why };
      const decision = gateAgentVerdict({ verdict, failure: previous.gateReason, spec, context, record, envelope, nowSec });
      if (decision.side) candidates.push({ window: w, decision });
      else notes.push(`${label}: ${decision.reason}`);
      continue;
    }
    if (!slot.open) {
      notes.push(`${label}: ${nowSec < slot.opensAtSec ? `read opens in ${slot.opensAtSec - nowSec}s` : "read slot closed"}`);
      continue;
    }
    agent.callsAtMs = agent.callsAtMs.filter((at) => nowMs - at < HOUR_MS);
    if (agent.callsAtMs.length >= agent.maxPerHour) {
      notes.push(`${label}: read budget spent (${agent.maxPerHour}/h); holding`);
      continue;
    }
    const model = `${brain.providerName}/${brain.modelId}`;
    const claim = await store.beginDecision({ strategyId: s.strategyId, marketId: w.marketId, runner: deps.runner, model, promptHash: promptHashOf(agentPrompt(spec, context, record)), dryRun: deps.dryRun });
    if (claim !== "acquired") {
      notes.push(`${label}: read already reserved; holding`);
      continue;
    }
    agent.callsAtMs.push(nowMs);
    const result = await withReceiptScope({ decisionId: decisionIdOf(id, w.marketId) }, () => decideAgentWindow({ spec, context, record, envelope, nowSec, model: brain.model, timeoutMs: agent.timeoutMs }));
    reads += 1;
    const { read, decision } = result;
    const stored = await store.recordDecision({
      strategyId: s.strategyId, marketId: w.marketId, runner: deps.runner, model: read.ok ? read.modelId : model, promptHash: result.promptHash,
      verdictSide: read.ok ? read.verdict.side : "none", confidence: read.ok ? read.verdict.confidence : null, why: read.ok ? read.verdict.why : read.detail,
      gate: decision.side ? "trade" : read.ok ? "held" : "failed", gateReason: decision.reason, side: decision.side, dryRun: deps.dryRun,
    });
    if (!stored) throw new Error("risk memory unavailable: the decision could not be stored; holding");
    deps.log(`#${s.strategyId}: ${label} ${read.ok ? `read ${read.verdict.side} (${read.verdict.confidence.toFixed(2)}) "${read.verdict.why}"` : `read failed: ${read.failure} — ${read.detail}`}; gate: ${decision.side ? `trade ${decision.side}` : "hold"} — ${decision.reason}`);
    notes.push(`${label} ${decision.side ? `bets ${decision.side}` : "held"}`);
    if (decision.side) candidates.push({ window: w, decision });
  }
  const why = mine.length === 0 ? `no trading Window on ${spec.cadences.map(formatCadence).join("/")} right now` : `read ${reads} of ${mine.length} Window${mine.length === 1 ? "" : "s"}${notes.length ? `: ${notes.join("; ")}` : ""}`;
  return { candidates, scanned: mine.length, closestBps: null, why };
}
