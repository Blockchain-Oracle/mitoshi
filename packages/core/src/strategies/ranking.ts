// Ported from Masayume 68f7a09:packages/core/src/strategies/ranking.ts
import type { Address } from "../types/primitives";
import type { StrategyRecordStats } from "./record";
import type { StrategyRecord } from "./types";

/** A runner key, aggregated across the strategies it executes (reference `AgentRow`). */
export interface AgentRow {
  runner: Address;
  strategies: number;
  subscribers: number;
  copyTrades: number;
  /** Collateral actually deployed for subscribers, base units. */
  capitalEntrustedBase: bigint;
  /** Realised result across settled copy-trades, base units. */
  netBase: bigint;
  settled: number;
  /** The widest per-trade ceiling across its strategies — the worst case a subscriber accepted. */
  maxStakePerTradeBase: bigint;
  lastActiveSec: number;
  topStrategyId: bigint | null;
}

/**
 * Ranked on entrusted capital and executed copy-trades, never win rate (the reference's own rule):
 * the runner has to put subscriber capital to work to climb.
 */
export function rankAgents(strategies: readonly StrategyRecord[], recordOf: (strategyId: bigint) => StrategyRecordStats | null): AgentRow[] {
  const rows = new Map<string, AgentRow>();
  for (const s of strategies) {
    const key = s.runner.toLowerCase();
    const record = recordOf(s.strategyId);
    const row = rows.get(key) ?? {
      runner: s.runner,
      strategies: 0,
      subscribers: 0,
      copyTrades: 0,
      capitalEntrustedBase: 0n,
      netBase: 0n,
      settled: 0,
      maxStakePerTradeBase: 0n,
      lastActiveSec: 0,
      topStrategyId: null,
    };
    row.strategies += 1;
    row.subscribers += s.subscribers;
    if (s.envelope.maxStakePerTradeBase > row.maxStakePerTradeBase) row.maxStakePerTradeBase = s.envelope.maxStakePerTradeBase;
    if (record) {
      row.copyTrades += record.fills;
      row.capitalEntrustedBase += record.stakedBase;
      row.netBase += record.netBase;
      row.settled += record.settled;
      if (record.lastActiveSec > row.lastActiveSec) row.lastActiveSec = record.lastActiveSec;
      if (row.topStrategyId === null || record.fills > 0) row.topStrategyId = row.topStrategyId ?? s.strategyId;
    } else if (row.topStrategyId === null) {
      row.topStrategyId = s.strategyId;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => (a.capitalEntrustedBase === b.capitalEntrustedBase ? 0 : a.capitalEntrustedBase > b.capitalEntrustedBase ? -1 : 1) || b.copyTrades - a.copyTrades || b.subscribers - a.subscribers,
  );
}
