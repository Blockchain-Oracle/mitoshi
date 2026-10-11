// Ported from Masayume 68f7a09:packages/db/src/strategy-attempts.ts — a store over the caller's `sql`; an attempt carries
// `follow | fade` (strategies/0003, A-1c).
/**
 * The runner's reservation before any send (migrations/strategies `strategy_attempts`): one per (strategy, Window,
 * subscriber, kind). A failed reservation prevents submission; an existing one is never resent — an interrupted attempt
 * is reconciled from the chain, never replayed. Fill attribution and the attempt's success commit together.
 */
import type { Sql } from "./index";
import type { StrategyFillRecord } from "./strategy-store";

export type StrategyAttemptState = "attempting" | "filled" | "settled" | "nothing-filled" | "refused" | "reverted" | "unknown";

export interface StrategyAttempt {
  kind: "order" | "settle";
  strategyId: string;
  marketId: string;
  owner: string;
  runner: string;
  grantId: string;
  side: "up" | "down";
  mode: "follow" | "fade";
  stakeBase: string;
  fromBlock: string;
  nonce: number;
  state: StrategyAttemptState;
  txHash: string | null;
  reason: string | null;
}
export type NewStrategyAttempt = Omit<StrategyAttempt, "state" | "txHash" | "reason" | "kind"> & { kind?: "order" | "settle" };
export type AttemptKey = Pick<StrategyAttempt, "strategyId" | "marketId" | "owner"> & { kind?: "order" | "settle" };

type Row = {
  kind: "order" | "settle"; strategy_id: string; market_id: string; owner: string; runner: string; grant_id: string; side: "up" | "down"; mode: "follow" | "fade"; stake_base: string;
  from_block: string; nonce: number; state: StrategyAttemptState; tx_hash: string | null; reason: string | null;
};
const fromRow = (r: Row): StrategyAttempt => ({
  kind: r.kind, strategyId: r.strategy_id, marketId: r.market_id, owner: r.owner, runner: r.runner, grantId: r.grant_id, side: r.side, mode: r.mode, stakeBase: r.stake_base,
  fromBlock: r.from_block, nonce: r.nonce, state: r.state, txHash: r.tx_hash, reason: r.reason,
});

export function createPgStrategyAttempts(sql: Sql) {
  return {
    async get(key: AttemptKey): Promise<StrategyAttempt | null> {
      const [r] = await sql<Row[]>`select * from strategy_attempts
        where strategy_id = ${key.strategyId} and market_id = ${key.marketId.toLowerCase()} and owner = ${key.owner.toLowerCase()} and kind = ${key.kind ?? "order"}`;
      return r ? fromRow(r) : null;
    },

    /** @returns false when a reservation already exists: the caller must not send. */
    async begin(a: NewStrategyAttempt): Promise<boolean> {
      const rows = await sql`
        insert into strategy_attempts (strategy_id, market_id, owner, runner, grant_id, side, mode, stake_base, from_block, nonce, kind, state)
        values (${a.strategyId}, ${a.marketId.toLowerCase()}, ${a.owner.toLowerCase()}, ${a.runner.toLowerCase()}, ${a.grantId}, ${a.side}, ${a.mode}, ${a.stakeBase},
          ${a.fromBlock}, ${a.nonce}, ${a.kind ?? "order"}, 'attempting')
        on conflict (strategy_id, market_id, owner, kind) do nothing returning strategy_id`;
      return rows.length === 1;
    },

    async finish(key: AttemptKey, state: Exclude<StrategyAttemptState, "attempting" | "filled">, txHash: string | null, reason: string): Promise<void> {
      await sql`update strategy_attempts set state = ${state}, tx_hash = coalesce(${txHash}, tx_hash), reason = ${reason}, updated_at = now()
        where strategy_id = ${key.strategyId} and market_id = ${key.marketId.toLowerCase()} and owner = ${key.owner.toLowerCase()} and kind = ${key.kind ?? "order"}
          and state not in ('filled', 'settled')`;
    },

    /** Fill attribution and the attempt's success, together — including during restart recovery. */
    async recordFill(fill: StrategyFillRecord): Promise<void> {
      await sql.begin(async (tx) => {
        await tx`
          insert into strategy_fills (tx_hash, strategy_id, grant_id, owner, market_id, side, mode, cash_delta, token_delta, at_sec, dry_run)
          values (${fill.txHash.toLowerCase()}, ${fill.strategyId}, ${fill.grantId}, ${fill.owner.toLowerCase()}, ${fill.marketId.toLowerCase()}, ${fill.side}, ${fill.mode},
            ${fill.cashDelta}, ${fill.tokenDelta}, ${fill.atSec}, false)
          on conflict (tx_hash) do nothing`;
        await tx`update strategy_attempts set state = 'filled', tx_hash = ${fill.txHash.toLowerCase()}, reason = null, updated_at = now()
          where strategy_id = ${fill.strategyId} and market_id = ${fill.marketId.toLowerCase()} and owner = ${fill.owner.toLowerCase()} and kind = 'order'`;
        await tx`update strategy_decisions set filled = (select count(*) from strategy_attempts where strategy_id = ${fill.strategyId} and market_id = ${fill.marketId.toLowerCase()} and kind = 'order' and state = 'filled')
          where strategy_id = ${fill.strategyId} and market_id = ${fill.marketId.toLowerCase()} and dry_run = false`;
      });
    },

    async unresolved(runner: string): Promise<StrategyAttempt[]> {
      const rows = await sql<Row[]>`select * from strategy_attempts where runner = ${runner.toLowerCase()} and state in ('attempting', 'unknown') order by from_block::numeric`;
      return rows.map(fromRow);
    },

    /** Includes paused or replaced subscriptions and attempts whose fill recording was interrupted. */
    async owners(strategyId: string): Promise<string[]> {
      const rows = await sql<{ owner: string }[]>`select owner from strategy_fills where strategy_id = ${strategyId} union select owner from strategy_attempts where strategy_id = ${strategyId}`;
      return rows.map((r) => r.owner);
    },

    async attemptedStrategyIds(runner: string): Promise<string[]> {
      const rows = await sql<{ strategy_id: string }[]>`select distinct strategy_id from strategy_attempts where runner = ${runner.toLowerCase()}`;
      return rows.map((r) => r.strategy_id);
    },
  };
}

export type StrategyAttemptStore = ReturnType<typeof createPgStrategyAttempts>;
