// Ported from Masayume 68f7a09:services/ops/src/actors/strategy-runner/agent-record.ts — settlement facts from the
// engine's own `marketOf` (state, payouts, expiry), read once per cycle; only follow fills are the agent's risk (a fade's
// loss is the agent's win, A-1c).
import type { Hex } from "viem";
import { utcDayOf, type AgentPastWindow, type AgentRecordSummary, type AgentWindowOutcome, type Side } from "@cwf/core";
import type { StrategyStore } from "@cwf/db";
import { fetchMarkets, type OpsClient, type Venue } from "@cwf/markets/ops";

const RECENT_WINDOWS = 5;
const DECISIONS_READ = 200;

/** A Window's settlement as the risk memory reads it; `atSec` is its expiry (when the result is known). */
export interface WindowSettlement {
  settled: boolean;
  voided: boolean;
  winner: Side | null;
  atSec: number;
}
export type SettlementReader = (marketId: string) => Promise<WindowSettlement | null>;

/** Settlement facts per Window, read once per cycle rather than once per row. */
export function settlementReader(client: OpsClient, venue: Venue): SettlementReader {
  const cache = new Map<string, Promise<WindowSettlement | null>>();
  return (marketId) => {
    const key = marketId.toLowerCase();
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchMarkets(client, venue, [key as Hex]).then(([m]) => {
        if (!m) return null;
        const settled = m.state === 1 || m.state === 2;
        return { settled, voided: m.state === 2, winner: m.state === 1 ? (m.payoutYes > m.payoutNo ? "up" : "down") : null, atSec: m.expirySec };
      });
      cache.set(key, pending);
    }
    return pending;
  };
}

function outcomeOf(side: Side, s: WindowSettlement | null): AgentWindowOutcome {
  if (!s || !s.settled) return "open";
  if (s.voided) return "void";
  return s.winner === side ? "won" : "lost";
}

/**
 * The agent's own memory, as the prompt and the gate read it: its last decided Windows with how they settled, its
 * straight losses on Windows it actually traded, and the worst realised loss any one follower took today — what the
 * posture's daily loss line is measured against (the envelope's daily cap is per subscriber too). Every outcome comes
 * from the Window's own settlement on chain.
 */
export async function readAgentRecord(store: StrategyStore, strategyId: bigint, nowSec: number, includeDryRun: boolean, settlementOf: SettlementReader): Promise<AgentRecordSummary> {
  const id = strategyId.toString();
  const [decisions, fills] = await Promise.all([store.listDecisions(id, DECISIONS_READ, includeDryRun), store.listFills({ strategyId: id, limit: 1_000 })]);
  const follows = fills.filter((f) => f.mode === "follow");
  const decided = decisions.filter((d): d is typeof d & { side: Side } => d.side !== null);
  const scored = await Promise.all(decided.map(async (d) => {
    const facts = await settlementOf(d.marketId);
    return { side: d.side, why: d.why, marketId: d.marketId, atSec: facts?.atSec ?? null, outcome: outcomeOf(d.side, facts) };
  }));
  const recent: AgentPastWindow[] = scored.slice(0, RECENT_WINDOWS).map(({ side, outcome, why }) => ({ side, outcome, why }));

  let consecutiveLosses = 0;
  let lastLossAtSec: number | null = null;
  const traded = scored.filter((d) => follows.some((f) => f.marketId === d.marketId.toLowerCase() && f.side === d.side)).sort((a, b) => (b.atSec ?? 0) - (a.atSec ?? 0));
  for (const w of traded) {
    if (w.outcome === "open" || w.outcome === "void") continue;
    if (w.outcome === "won") break;
    consecutiveLosses += 1;
    lastLossAtSec ??= w.atSec;
  }

  const today = utcDayOf(nowSec);
  const lostByOwner = new Map<string, bigint>();
  for (const f of follows) {
    const facts = await settlementOf(f.marketId);
    if (!facts?.settled || utcDayOf(facts.atSec) !== today || outcomeOf(f.side, facts) !== "lost") continue;
    lostByOwner.set(f.owner, (lostByOwner.get(f.owner) ?? 0n) + BigInt(f.cashDelta));
  }
  const lostTodayBase = [...lostByOwner.values()].reduce((max, v) => (v > max ? v : max), 0n);
  return { recent, consecutiveLosses, lostTodayBase, lastLossAtSec };
}
