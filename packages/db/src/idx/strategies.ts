/**
 * Reads over the registry's projections (index/0006; S9): the board's list (with each agent's ERC-8004 feedback
 * summarised), one wallet's subscriptions, the subscribers a runner pages through, and an agent's feedback. Amounts come
 * back as decimal strings (NUMERIC, never floats); the caller parses with bigint.
 */
import type { Sql } from "../index";

export interface IndexedStrategy {
  registry: string;
  strategyId: string;
  creator: string;
  runner: string;
  specHash: string;
  metadataHash: string | null;
  /** The published metadata (UTF-8), null until the follower has read bytes matching the hash. */
  metadata: string | null;
  agentId: string | null;
  maxStakePerTradeBase: string;
  maxDailySpendBase: string;
  maxOpenPositions: number;
  maxPriceRaw: string;
  series: string | null;
  feeBase: string;
  active: boolean;
  subscribers: number;
  revision: number;
  createdAtSec: number;
  /** Non-revoked ERC-8004 feedback on the strategy's agent: how many, and their mean as a decimal string (null: none). */
  feedbackCount: number;
  feedbackMean: string | null;
}

export interface IndexedSubscription {
  registry: string;
  strategyId: string;
  subscriber: string;
  grantId: string;
  mode: "follow" | "fade";
  active: boolean;
  feesPaidBase: string;
  firstSubscribedAtSec: number;
  subscribedAtSec: number;
  unsubscribedAtSec: number | null;
}

export interface AgentFeedback {
  client: string;
  feedbackIndex: string;
  value: string;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  feedbackUri: string;
  revoked: boolean;
  txHash: string;
  atSec: number;
}

type StrategyRaw = {
  registry: string; strategy_id: string; creator: string; runner: string; spec_hash: string; metadata_hash: string | null; metadata: string | null; agent_id: string | null;
  max_stake_per_trade_base: string; max_daily_spend_base: string; max_open_positions: number; max_price_raw: string; series: string | null; fee_base: string;
  active: boolean; subscribers: number; revision: number; created_at_sec: string; feedback_count: number; feedback_mean: string | null;
};
const fromStrategy = (r: StrategyRaw): IndexedStrategy => ({
  registry: r.registry, strategyId: r.strategy_id, creator: r.creator, runner: r.runner, specHash: r.spec_hash, metadataHash: r.metadata_hash, metadata: r.metadata, agentId: r.agent_id,
  maxStakePerTradeBase: r.max_stake_per_trade_base, maxDailySpendBase: r.max_daily_spend_base, maxOpenPositions: r.max_open_positions, maxPriceRaw: r.max_price_raw, series: r.series,
  feeBase: r.fee_base, active: r.active, subscribers: r.subscribers, revision: r.revision, createdAtSec: Number(r.created_at_sec), feedbackCount: r.feedback_count, feedbackMean: r.feedback_mean,
});

type SubscriptionRaw = { registry: string; strategy_id: string; subscriber: string; grant_id: string; mode: number; active: boolean; fees_paid_base: string; first_subscribed_at_sec: string; subscribed_at_sec: string; unsubscribed_at_sec: string | null };
const fromSubscription = (r: SubscriptionRaw): IndexedSubscription => ({
  registry: r.registry, strategyId: r.strategy_id, subscriber: r.subscriber, grantId: r.grant_id, mode: r.mode === 1 ? "fade" : "follow", active: r.active, feesPaidBase: r.fees_paid_base,
  firstSubscribedAtSec: Number(r.first_subscribed_at_sec), subscribedAtSec: Number(r.subscribed_at_sec), unsubscribedAtSec: r.unsubscribed_at_sec === null ? null : Number(r.unsubscribed_at_sec),
});

/** The registry's strategies, newest first; `activeOnly` leaves out the ones closed to new copiers. */
export async function readIndexedStrategies(sql: Sql, q: { registry: string; activeOnly?: boolean; strategyId?: string; creator?: string; limit?: number }): Promise<IndexedStrategy[]> {
  const rows = await sql<StrategyRaw[]>`
    select s.registry, s.strategy_id::text, s.creator, s.runner, s.spec_hash, s.metadata_hash, s.metadata, s.agent_id::text, s.max_stake_per_trade_base::text,
      s.max_daily_spend_base::text, s.max_open_positions, s.max_price_raw::text, s.series, s.fee_base::text, s.active, s.subscribers, s.revision, s.created_at_sec::text,
      coalesce(f.n, 0)::int as feedback_count, f.mean::text as feedback_mean
    from idx_strategies s
    left join lateral (
      select count(*) as n, avg(value / power(10::numeric, value_decimals)) as mean from idx_agent_feedback
      where agent_id = s.agent_id and not revoked
    ) f on s.agent_id is not null
    where s.registry = ${q.registry.toLowerCase()}
      ${q.activeOnly ? sql`and s.active` : sql``}
      ${q.strategyId ? sql`and s.strategy_id = ${q.strategyId}::bigint` : sql``}
      ${q.creator ? sql`and s.creator = ${q.creator.toLowerCase()}` : sql``}
    order by s.strategy_id desc limit ${Math.min(500, q.limit ?? 200)}`;
  return rows.map(fromStrategy);
}

/** One wallet's subscriptions, live ones first. */
export async function readSubscriptionsOf(sql: Sql, registry: string, subscriber: string): Promise<IndexedSubscription[]> {
  const rows = await sql<SubscriptionRaw[]>`
    select registry, strategy_id::text, subscriber, grant_id::text, mode, active, fees_paid_base::text, first_subscribed_at_sec::text, subscribed_at_sec::text, unsubscribed_at_sec::text
    from idx_subscriptions where registry = ${registry.toLowerCase()} and subscriber = ${subscriber.toLowerCase()}
    order by active desc, subscribed_at_sec desc`;
  return rows.map(fromSubscription);
}

/** Everyone subscribed to one strategy (the runner's worklist), oldest first; `activeOnly` by default. */
export async function readSubscribers(sql: Sql, registry: string, strategyId: string, activeOnly = true): Promise<IndexedSubscription[]> {
  const rows = await sql<SubscriptionRaw[]>`
    select registry, strategy_id::text, subscriber, grant_id::text, mode, active, fees_paid_base::text, first_subscribed_at_sec::text, subscribed_at_sec::text, unsubscribed_at_sec::text
    from idx_subscriptions where registry = ${registry.toLowerCase()} and strategy_id = ${strategyId}::bigint ${activeOnly ? sql`and active` : sql``}
    order by first_subscribed_at_sec, subscriber`;
  return rows.map(fromSubscription);
}

/** An agent's ERC-8004 feedback, newest first, revoked included (marked). */
export async function readAgentFeedback(sql: Sql, agentId: string, limit = 50): Promise<AgentFeedback[]> {
  const rows = await sql<{ client: string; feedback_index: string; value: string; value_decimals: number; tag1: string; tag2: string; feedback_uri: string; revoked: boolean; tx_hash: string; at_sec: string }[]>`
    select client, feedback_index::text, value::text, value_decimals, tag1, tag2, feedback_uri, revoked, tx_hash, at_sec::text
    from idx_agent_feedback where agent_id = ${agentId}::numeric order by block_number desc, feedback_index desc limit ${Math.min(200, limit)}`;
  return rows.map((r) => ({ client: r.client, feedbackIndex: r.feedback_index, value: r.value, valueDecimals: r.value_decimals, tag1: r.tag1, tag2: r.tag2, feedbackUri: r.feedback_uri, revoked: r.revoked, txHash: r.tx_hash, atSec: Number(r.at_sec) }));
}

/** One of a trader's own calls on a Window, in YES terms (the engine's kinds: 0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO). */
export interface TraderCall {
  txHash: string;
  logIndex: number;
  market: string;
  kind: number;
  /** Raw contracts (lots × the Series' lot size for an engine fill; the vault's token delta for a Trading Balance one). */
  quantityRaw: string;
  atSec: number;
}

/**
 * What a mirror copies (A-3b): one wallet's own calls on these Windows since `sinceSec` — every engine fill it took or
 * made, and every Trading Balance execution recorded for it as owner except those a STRATEGY grant's runner made (a
 * copier's fills are someone else's decisions). Units are normalised to raw contracts so the calls net correctly.
 */
export async function readTraderCalls(sql: Sql, q: { address: string; sinceSec: number; markets: readonly string[] }): Promise<TraderCall[]> {
  if (q.markets.length === 0) return [];
  const a = q.address.toLowerCase();
  const markets = q.markets.map((m) => m.toLowerCase());
  const rows = await sql<{ tx_hash: string; log_index: number; market: string; kind: number; quantity_raw: string; at_sec: string }[]>`
    select * from (
      select f.tx_hash, f.log_index, f.market, case when f.taker = ${a} then f.taker_kind else f.maker_kind end as kind,
        (f.lots * s.lot_base)::text as quantity_raw, f.ts_sec::text as at_sec
      from idx_fills f join idx_markets m on m.market = f.market join idx_series s on s.series = m.series
      where (f.taker = ${a} or f.maker = ${a}) and f.ts_sec >= ${q.sinceSec} and f.market = any(${markets}::text[])
      union all
      select x.tx_hash, x.log_index, x.market,
        case when x.outcome_idx = 0 then (case when x.is_buy then 0 else 1 end) else (case when x.is_buy then 2 else 3 end) end,
        abs(x.token_delta)::text, x.at_sec::text
      from idx_vault_executions x left join idx_vault_grants g on g.vault = x.vault and g.grant_id = x.grant_id
      where x.owner = ${a} and x.at_sec >= ${q.sinceSec} and x.market = any(${markets}::text[]) and (x.grant_id = 0 or g.kind is distinct from 2)
    ) u order by at_sec::bigint, log_index`;
  return rows.map((r) => ({ txHash: r.tx_hash, logIndex: r.log_index, market: r.market, kind: r.kind, quantityRaw: r.quantity_raw, atSec: Number(r.at_sec) }));
}

/** The days (`tag2`) one client has already rated an agent under `tag1`, revoked ones excluded. */
export async function readRatedDays(sql: Sql, agentId: string, client: string, tag1: string): Promise<Set<string>> {
  const rows = await sql<{ tag2: string }[]>`select tag2 from idx_agent_feedback where agent_id = ${agentId}::numeric and client = ${client.toLowerCase()} and tag1 = ${tag1} and not revoked`;
  return new Set(rows.map((r) => r.tag2));
}
