// The strategy a confirmed publish created, as the catalogue lists it (R4-6, D-227; automate bug 1): built from what
// the receipt confirmed — its id, its creator, the envelope, spec and metadata that went on chain — with an empty
// record, so Yours lists it at once while the index catches up (the next catalogue read replaces it).
import { describeSpec } from "@cwf/core";
import type { StrategyWire } from "./protocol";
import type { Draft, DraftCheck } from "./studio-draft";

export function publishedWire({ id, creator, check, draft, agentId, seriesLabel }: { id: string; creator: string; check: DraftCheck; draft: Draft; agentId: bigint | null; seriesLabel: string | null }): StrategyWire {
  const e = check.envelope!;
  const spec = check.spec!;
  return {
    strategyId: id, creator: creator.toLowerCase(), runner: check.runner!, agentId: draft.identity && agentId !== null ? agentId.toString() : null,
    name: check.metadata!.name, description: check.metadata!.description, portraitSeed: check.metadata!.portraitSeed ?? null, feesEarnedBase: "0",
    spec, specText: describeSpec(spec),
    envelope: { maxStakePerTradeBase: e.maxStakePerTradeBase.toString(), maxDailySpendBase: e.maxDailySpendBase.toString(), maxOpenPositions: e.maxOpenPositions, maxPriceRaw: e.maxPriceRaw.toString(), series: e.series, seriesLabel: e.series ? seriesLabel : null },
    feeBase: check.feeBase.toString(), active: true, subscribers: 0, createdAtSec: Math.floor(Date.now() / 1000), revision: 0,
    record: { fills: 0, settled: 0, wins: 0, losses: 0, voids: 0, netBase: "0", stakedBase: "0", curve: [], lastActiveSec: 0, distinctSubscribers: 0, open: 0, copyTrades: 0, entrustedBase: "0" },
    health: { kind: "never-started", lastTickMs: null, intervalMs: null, why: null, state: null },
    agent: spec.preset === "agent" ? { model: null } : null,
    decisions: { total: 0, bets: 0, held: 0, failed: 0, lastAtMs: null, recent: [] },
    feedback: { count: 0, mean: null },
    memory: null,
  };
}
