// The agents board's order (S9.8; Q-001, D-218.5): Masayume's inherited rule — capital its copiers entrusted, then copy
// trades, then copiers; never results — kept and labelled "inherited", with every row also showing its P&L and the
// sample size behind it; or ranked by settled P&L, the owner's other choice. Each ranked thing is an ERC-8004 agent
// (a strategy that named one at publish); strategies without an identity are on the desk, not the board.
import type { StrategyWire } from "../strategies/protocol";

export type BoardSort = "inherited" | "pnl";

const cmp = (a: bigint, b: bigint) => (a === b ? 0 : a > b ? -1 : 1);

export function rankAgents(strategies: readonly StrategyWire[], sort: BoardSort): StrategyWire[] {
  const agents = strategies.filter((s) => s.agentId !== null);
  return [...agents].sort((a, b) =>
    sort === "pnl"
      ? cmp(BigInt(a.record.netBase), BigInt(b.record.netBase)) || b.record.settled - a.record.settled || Number(BigInt(a.strategyId) - BigInt(b.strategyId))
      : cmp(BigInt(a.record.entrustedBase), BigInt(b.record.entrustedBase)) || b.record.copyTrades - a.record.copyTrades || b.subscribers - a.subscribers || Number(BigInt(a.strategyId) - BigInt(b.strategyId)),
  );
}
