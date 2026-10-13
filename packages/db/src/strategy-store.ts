// Ported from Masayume 68f7a09:packages/db/src/{strategies,strategy-decisions}.ts — the module-level `getDb()` becomes
// a store over the caller's `sql` (the repo's pattern); a fill carries `follow | fade` (strategies/0003, A-1c).
/**
 * The runner's own records (migrations/strategies): its heartbeat ("scanned 6 markets, closest trigger 8 bps away"),
 * each fill it executed for a subscriber, the creator's plain playbook, and an agent strategy's one decision per Window
 * (reserved before the model call, so a restart never asks twice). Amounts are decimal strings, never floats; ids and
 * addresses are lowercased at the write.
 */
import { INTERRUPTED_READ_REASON, parseRunnerBeat, type RunnerBeat } from "@cwf/core";
import type { PendingQuery, Row } from "postgres";
import type { Sql } from "./index";

export interface HeartbeatRecord {
  runner: string;
  strategyId: string;
  tickAtMs: number;
  intervalMs: number;
  why: string;
  scanned: number;
  closestBps: number | null;
  dryRun: boolean;
  /** What the pass did, as data (strategies/0005); null on older rows. */
  state: RunnerBeat | null;
}
export type NewHeartbeat = Omit<HeartbeatRecord, "tickAtMs" | "state"> & { state?: RunnerBeat | null };

export interface StrategyFillRecord {
  txHash: string;
  strategyId: string;
  grantId: string;
  owner: string;
  marketId: string;
  side: "up" | "down";
  mode: "follow" | "fade";
  cashDelta: string;
  tokenDelta: string;
  atSec: number;
  dryRun: boolean;
}

export type DecisionVerdictSide = "up" | "down" | "hold" | "none";
export type DecisionGate = "trade" | "held" | "failed";

/** One Window an agent strategy read: the model's words, the gate's ruling, what the runner then sent. */
export interface StrategyDecisionRecord {
  id: number;
  strategyId: string;
  marketId: string;
  runner: string;
  decidedAtMs: number;
  model: string;
  promptHash: string;
  verdictSide: DecisionVerdictSide;
  confidence: number | null;
  why: string;
  gate: DecisionGate;
  gateReason: string;
  side: "up" | "down" | null;
  filled: number;
  skipped: number;
  dryRun: boolean;
}
export type NewStrategyDecision = Omit<StrategyDecisionRecord, "id" | "decidedAtMs" | "filled" | "skipped">;

/** A rule's or a mirror's call on a Window (`@cwf/core` ruleModelOf): recorded as ruled, once. */
export type NewStrategyCall = Pick<StrategyDecisionRecord, "strategyId" | "marketId" | "runner" | "model" | "why" | "gateReason" | "dryRun"> & { side: "up" | "down"; decidedAtMs: number; filled?: number };

/** How many decisions one strategy has made (dry runs never count), by ruling, and when it last decided. */
export interface DecisionCounts {
  strategyId: string;
  total: number;
  bets: number;
  held: number;
  failed: number;
  lastAtMs: number | null;
}

type HeartbeatRow = { runner: string; strategy_id: string; tick_at: Date; interval_ms: number; why: string; scanned: number; closest_bps: number | null; dry_run: boolean; state: unknown };
type FillRow = { tx_hash: string; strategy_id: string; grant_id: string; owner: string; market_id: string; side: "up" | "down"; mode: "follow" | "fade"; cash_delta: string; token_delta: string; at_sec: string; dry_run: boolean };
type DecisionRow = {
  id: string; strategy_id: string; market_id: string; runner: string; decided_at: Date; model: string; prompt_hash: string; verdict_side: DecisionVerdictSide; confidence: number | null;
  why: string; gate: DecisionGate; gate_reason: string; side: "up" | "down" | null; filled: number; skipped: number; dry_run: boolean;
};

const toHeartbeat = (r: HeartbeatRow): HeartbeatRecord => ({
  runner: r.runner, strategyId: r.strategy_id, tickAtMs: r.tick_at.getTime(), intervalMs: r.interval_ms, why: r.why, scanned: r.scanned, closestBps: r.closest_bps, dryRun: r.dry_run, state: parseRunnerBeat(r.state),
});
const toFill = (r: FillRow): StrategyFillRecord => ({ txHash: r.tx_hash, strategyId: r.strategy_id, grantId: r.grant_id, owner: r.owner, marketId: r.market_id, side: r.side, mode: r.mode, cashDelta: r.cash_delta, tokenDelta: r.token_delta, atSec: Number(r.at_sec), dryRun: r.dry_run });
const toDecision = (r: DecisionRow): StrategyDecisionRecord => ({
  id: Number(r.id), strategyId: r.strategy_id, marketId: r.market_id, runner: r.runner, decidedAtMs: r.decided_at.getTime(), model: r.model, promptHash: r.prompt_hash, verdictSide: r.verdict_side,
  confidence: r.confidence, why: r.why, gate: r.gate, gateReason: r.gate_reason, side: r.side, filled: r.filled, skipped: r.skipped, dryRun: r.dry_run,
});

/** Postgres `undefined_column`. */
const UNDEFINED_COLUMN = "42703";

export function createPgStrategyStore(sql: Sql) {
  /**
   * `runner_heartbeats.state` arrives with strategies/0005, which ops runs at boot — after the web on a normal ship, and
   * never if an ops deploy fails. Until it exists a read selects the older shape (`state` null) rather than failing
   * /agents and /api/strategies.
   */
  const heartbeats = async (read: (state: PendingQuery<Row[]>) => Promise<HeartbeatRow[]>): Promise<HeartbeatRecord[]> => {
    try {
      return (await read(sql`state`)).map(toHeartbeat);
    } catch (error) {
      if ((error as { code?: string }).code !== UNDEFINED_COLUMN) throw error;
      return (await read(sql`null::jsonb as state`)).map(toHeartbeat);
    }
  };
  return {
    async recordHeartbeat(beat: NewHeartbeat): Promise<void> {
      await sql`
        insert into runner_heartbeats (runner, strategy_id, interval_ms, why, scanned, closest_bps, dry_run, state)
        values (${beat.runner.toLowerCase()}, ${beat.strategyId}, ${beat.intervalMs}, ${beat.why}, ${beat.scanned}, ${beat.closestBps}, ${beat.dryRun}, ${beat.state ? sql.json(beat.state as never) : null})`;
    },

    /** The latest heartbeat per strategy. */
    async latestHeartbeats(): Promise<HeartbeatRecord[]> {
      return heartbeats((state) => sql<HeartbeatRow[]>`
        select distinct on (strategy_id) runner, strategy_id, tick_at, interval_ms, why, scanned, closest_bps, dry_run, ${state}
        from runner_heartbeats order by strategy_id, tick_at desc`);
    },

    /** The runner's last words for one strategy, newest first — the live why/why-not feed. */
    async recentHeartbeats(strategyId: string, limit: number): Promise<HeartbeatRecord[]> {
      return heartbeats((state) => sql<HeartbeatRow[]>`
        select runner, strategy_id, tick_at, interval_ms, why, scanned, closest_bps, dry_run, ${state}
        from runner_heartbeats where strategy_id = ${strategyId} order by tick_at desc limit ${limit}`);
    },

    /** A fill's receipt; the tx hash keys it, so a cycle that re-reads its own receipt cannot double-count. */
    async recordFill(fill: StrategyFillRecord): Promise<void> {
      await sql`
        insert into strategy_fills (tx_hash, strategy_id, grant_id, owner, market_id, side, mode, cash_delta, token_delta, at_sec, dry_run)
        values (${fill.txHash.toLowerCase()}, ${fill.strategyId}, ${fill.grantId}, ${fill.owner.toLowerCase()}, ${fill.marketId.toLowerCase()}, ${fill.side}, ${fill.mode},
          ${fill.cashDelta}, ${fill.tokenDelta}, ${fill.atSec}, ${fill.dryRun})
        on conflict (tx_hash) do nothing`;
    },

    /** Newest first; all strategies when `strategyId` is null; one owner's when `owner` is set. Dry-run rows are not trades.
     *  No `limit`: every fill — what a record counts (a page of the latest would undercount a busy strategy's). */
    async listFills(q: { strategyId: string | null; owner?: string; limit?: number }): Promise<StrategyFillRecord[]> {
      const rows = await sql<FillRow[]>`
        select * from strategy_fills where dry_run = false
          ${q.strategyId ? sql`and strategy_id = ${q.strategyId}` : sql``}
          ${q.owner ? sql`and owner = ${q.owner.toLowerCase()}` : sql``}
        order by at_sec desc ${q.limit === undefined ? sql`` : sql`limit ${q.limit}`}`;
      return rows.map(toFill);
    },

    /** The creator's plain-text playbook. The caller verifies the creator's signature; this layer does not gate. */
    async upsertPlaybook(strategyId: string, creator: string, body: string): Promise<void> {
      await sql`
        insert into strategy_playbooks (strategy_id, creator, body) values (${strategyId}, ${creator.toLowerCase()}, ${body})
        on conflict (strategy_id) do update set creator = excluded.creator, body = excluded.body, updated_at = now()`;
    },

    async playbookOf(strategyId: string): Promise<{ creator: string; body: string; updatedAtMs: number } | null> {
      const [r] = await sql<{ creator: string; body: string; updated_at: Date }[]>`select creator, body, updated_at from strategy_playbooks where strategy_id = ${strategyId}`;
      return r ? { creator: r.creator, body: r.body, updatedAtMs: r.updated_at.getTime() } : null;
    },

    /** Reserve before the provider call. The database, not the process cache, owns uniqueness. */
    async beginDecision(d: Pick<NewStrategyDecision, "strategyId" | "marketId" | "runner" | "model" | "promptHash" | "dryRun">): Promise<"acquired" | "existing"> {
      const rows = await sql`
        insert into strategy_decisions (strategy_id, market_id, runner, model, prompt_hash, verdict_side, why, gate, gate_reason, dry_run)
        values (${d.strategyId}, ${d.marketId.toLowerCase()}, ${d.runner.toLowerCase()}, ${d.model}, ${d.promptHash}, 'none', 'Reading this Window', 'pending', 'Read in progress', ${d.dryRun})
        on conflict (strategy_id, market_id, dry_run) do nothing returning id`;
      return rows.length ? "acquired" : "existing";
    },

    /** A process that died during a provider call holds that Window; it never asks twice. */
    async interruptDecisions(runner: string, beforeMs: number): Promise<void> {
      await sql`update strategy_decisions set gate = 'failed', why = 'Runner interrupted during the model read', gate_reason = ${INTERRUPTED_READ_REASON}
        where runner = ${runner.toLowerCase()} and gate = 'pending' and decided_at < ${new Date(beforeMs)}`;
    },

    /** One read per Window: only a pending reservation takes the ruling. */
    async recordDecision(d: NewStrategyDecision): Promise<boolean> {
      const rows = await sql`
        update strategy_decisions set model = ${d.model}, prompt_hash = ${d.promptHash}, verdict_side = ${d.verdictSide}, confidence = ${d.confidence}, why = ${d.why},
          gate = ${d.gate}, gate_reason = ${d.gateReason}, side = ${d.side}
        where strategy_id = ${d.strategyId} and market_id = ${d.marketId.toLowerCase()} and dry_run = ${d.dryRun} and gate = 'pending' returning id`;
      return rows.length === 1;
    },

    /** A rule's call, recorded once per Window (the first pass its trigger holds); false when the Window already has one. */
    async recordCall(c: NewStrategyCall): Promise<boolean> {
      const rows = await sql`
        insert into strategy_decisions (strategy_id, market_id, runner, decided_at, model, prompt_hash, verdict_side, why, gate, gate_reason, side, filled, dry_run)
        values (${c.strategyId}, ${c.marketId.toLowerCase()}, ${c.runner.toLowerCase()}, ${new Date(c.decidedAtMs)}, ${c.model}, '', ${c.side}, ${c.why}, 'trade', ${c.gateReason}, ${c.side},
          ${c.filled ?? 0}, ${c.dryRun})
        on conflict (strategy_id, market_id, dry_run) do nothing returning id`;
      return rows.length === 1;
    },

    /** Every strategy's decision counts (or one's), dry runs excluded. */
    async decisionCounts(strategyId: string | null = null): Promise<DecisionCounts[]> {
      const rows = await sql<{ strategy_id: string; total: string; bets: string; held: string; failed: string; last_at: Date | null }[]>`
        select strategy_id, count(*) as total, count(*) filter (where gate = 'trade') as bets, count(*) filter (where gate = 'held') as held,
          count(*) filter (where gate = 'failed') as failed, max(decided_at) as last_at
        from strategy_decisions where dry_run = false and gate <> 'pending' ${strategyId ? sql`and strategy_id = ${strategyId}` : sql``}
        group by strategy_id`;
      return rows.map((r) => ({ strategyId: r.strategy_id, total: Number(r.total), bets: Number(r.bets), held: Number(r.held), failed: Number(r.failed), lastAtMs: r.last_at ? r.last_at.getTime() : null }));
    },

    /** After a pass executed this Window: the copies it filled on this Window and the copiers it could not fill here —
     *  this Window's own counts, never the pass's totals. A live fill already set `filled` to the Window's filled
     *  attempts (`recordFill`); this only ever raises it. */
    async markDecisionExecution(strategyId: string, marketId: string, filled: number, skipped: number, dryRun = false): Promise<void> {
      await sql`update strategy_decisions set filled = greatest(filled, ${filled}), skipped = ${skipped}
        where strategy_id = ${strategyId} and market_id = ${marketId.toLowerCase()} and dry_run = ${dryRun}`;
    },

    /** Newest first; all strategies when `strategyId` is null. A rehearsal is never shown as memory unless asked for.
     *  `readsOnly`: an agent's model reads only, never a rule's recorded call (`rule/<preset>`) — the read budget's view. */
    async listDecisions(strategyId: string | null, limit: number, includeDryRun = false, readsOnly = false): Promise<StrategyDecisionRecord[]> {
      const rows = await sql<DecisionRow[]>`
        select * from strategy_decisions where gate <> 'pending'
          ${strategyId ? sql`and strategy_id = ${strategyId}` : sql``}
          ${includeDryRun ? sql`` : sql`and dry_run = false`}
          ${readsOnly ? sql`and model not like 'rule/%'` : sql``}
        order by decided_at desc limit ${limit}`;
      return rows.map(toDecision);
    },

    /** Each strategy's latest `perStrategy` decisions (dry runs never), newest first — a busy strategy can't crowd a quiet
     *  one off its card the way one global "latest N" did. */
    async latestDecisionsPerStrategy(perStrategy: number): Promise<StrategyDecisionRecord[]> {
      const rows = await sql<DecisionRow[]>`
        select id, strategy_id, market_id, runner, decided_at, model, prompt_hash, verdict_side, confidence, why, gate, gate_reason, side, filled, skipped, dry_run from (
          select *, row_number() over (partition by strategy_id order by decided_at desc) as rn from strategy_decisions where gate <> 'pending' and dry_run = false
        ) ranked where rn <= ${perStrategy} order by decided_at desc`;
      return rows.map(toDecision);
    },

    async decisionOf(strategyId: string, marketId: string, dryRun: boolean): Promise<StrategyDecisionRecord | null> {
      const [r] = await sql<DecisionRow[]>`select * from strategy_decisions where strategy_id = ${strategyId} and market_id = ${marketId.toLowerCase()} and dry_run = ${dryRun} and gate <> 'pending'`;
      return r ? toDecision(r) : null;
    },
  };
}

export type StrategyStore = ReturnType<typeof createPgStrategyStore>;
