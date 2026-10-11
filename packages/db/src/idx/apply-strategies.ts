/**
 * Projection writes for one decoded StrategyRegistry or ERC-8004 ReputationRegistry event (index/0006; S9). Runs inside
 * the writer's DB transaction; like the vault's, these events are stored with `market` NULL and applied exactly once, in
 * (block, log index) order. Every row is keyed by its registry (the event's address). `Published` / `Updated` may carry
 * `metadata` — the follower's read of `metadataOf`, kept only when its keccak matched the event's `metadataHash`.
 */
import type postgres from "postgres";
import type { IdxEvent } from "./types";

type Tx = postgres.TransactionSql;
type Data = Record<string, unknown>;

export const STRATEGY_EVENTS: ReadonlySet<string> = new Set(["Published", "Updated", "RunnerChanged", "Deactivated", "Subscribed", "Unsubscribed"]);
export const FEEDBACK_EVENTS: ReadonlySet<string> = new Set(["NewFeedback", "FeedbackRevoked"]);

const str = (d: Data, key: string): string => {
  const v = d[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  throw new Error(`strategy event field ${key} missing`);
};
const addr = (d: Data, key: string) => str(d, key).toLowerCase();
const ZERO = `0x${"0".repeat(64)}`;
const orNull = (hex: string) => (hex.toLowerCase() === ZERO ? null : hex.toLowerCase());
const metadataOf = (d: Data) => (typeof d.metadata === "string" ? d.metadata : null);

async function published(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const env = d.envelope as Data;
  const agentId = str(d, "agentId");
  await tx`
    insert into idx_strategies (registry, strategy_id, creator, runner, spec_hash, metadata_hash, metadata, agent_id, max_stake_per_trade_base,
      max_daily_spend_base, max_open_positions, max_price_raw, series, fee_base, created_tx, created_block, created_at_sec, updated_at_sec)
    values (${e.address}, ${str(d, "strategyId")}::bigint, ${addr(d, "creator")}, ${addr(d, "runner")}, ${str(d, "specHash").toLowerCase()},
      ${orNull(str(d, "metadataHash"))}, ${metadataOf(d)}, ${agentId === "0" ? null : agentId}::numeric, ${str(env, "maxStakePerTrade")}::numeric,
      ${str(env, "maxDailySpend")}::numeric, ${Number(str(env, "maxOpenPositions"))}, ${str(env, "maxPriceRaw")}::numeric, ${orNull(str(env, "market"))},
      ${str(d, "fee")}::numeric, ${e.txHash}, ${e.blockNumber}, ${e.blockTimeSec}, ${e.blockTimeSec})
    on conflict (registry, strategy_id) do nothing`;
}

async function subscribed(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const id = str(d, "strategyId");
  await tx`
    insert into idx_subscriptions (registry, strategy_id, subscriber, grant_id, mode, active, fees_paid_base, first_subscribed_at_sec, subscribed_at_sec)
    values (${e.address}, ${id}::bigint, ${addr(d, "subscriber")}, ${str(d, "grantId")}::bigint, ${Number(str(d, "mode"))}, true, ${str(d, "feePaid")}::numeric,
      ${e.blockTimeSec}, ${e.blockTimeSec})
    on conflict (registry, strategy_id, subscriber) do update set grant_id = excluded.grant_id, mode = excluded.mode, active = true,
      fees_paid_base = idx_subscriptions.fees_paid_base + excluded.fees_paid_base, subscribed_at_sec = excluded.subscribed_at_sec, unsubscribed_at_sec = null`;
  await tx`update idx_strategies set subscribers = ${Number(str(d, "subscribers"))}, updated_at_sec = ${e.blockTimeSec} where registry = ${e.address} and strategy_id = ${id}::bigint`;
}

/** @returns whether the event was one of the registry's or the reputation registry's. */
export async function applyStrategyEvent(tx: Tx, e: IdxEvent): Promise<boolean> {
  const d = e.data;
  switch (e.name) {
    case "Published":
      await published(tx, e);
      return true;
    case "Updated":
      await tx`
        update idx_strategies set spec_hash = ${str(d, "specHash").toLowerCase()}, metadata_hash = ${orNull(str(d, "metadataHash"))}, metadata = ${metadataOf(d)},
          fee_base = ${str(d, "fee")}::numeric, revision = ${Number(str(d, "revision"))}, updated_at_sec = ${e.blockTimeSec}
        where registry = ${e.address} and strategy_id = ${str(d, "strategyId")}::bigint`;
      return true;
    case "RunnerChanged":
      await tx`update idx_strategies set runner = ${addr(d, "runner")}, updated_at_sec = ${e.blockTimeSec} where registry = ${e.address} and strategy_id = ${str(d, "strategyId")}::bigint`;
      return true;
    case "Deactivated":
      await tx`update idx_strategies set active = false, updated_at_sec = ${e.blockTimeSec} where registry = ${e.address} and strategy_id = ${str(d, "strategyId")}::bigint`;
      return true;
    case "Subscribed":
      await subscribed(tx, e);
      return true;
    case "Unsubscribed": {
      const id = str(d, "strategyId");
      await tx`update idx_subscriptions set active = false, unsubscribed_at_sec = ${e.blockTimeSec} where registry = ${e.address} and strategy_id = ${id}::bigint and subscriber = ${addr(d, "subscriber")}`;
      await tx`update idx_strategies set subscribers = ${Number(str(d, "subscribers"))}, updated_at_sec = ${e.blockTimeSec} where registry = ${e.address} and strategy_id = ${id}::bigint`;
      return true;
    }
    case "NewFeedback":
      await tx`
        insert into idx_agent_feedback (registry, agent_id, client, feedback_index, value, value_decimals, tag1, tag2, endpoint, feedback_uri, feedback_hash, tx_hash, block_number, at_sec)
        values (${e.address}, ${str(d, "agentId")}::numeric, ${addr(d, "clientAddress")}, ${str(d, "feedbackIndex")}::bigint, ${str(d, "value")}::numeric,
          ${Number(str(d, "valueDecimals"))}, ${str(d, "tag1")}, ${str(d, "tag2")}, ${str(d, "endpoint")}, ${str(d, "feedbackURI")}, ${str(d, "feedbackHash").toLowerCase()},
          ${e.txHash}, ${e.blockNumber}, ${e.blockTimeSec})
        on conflict do nothing`;
      return true;
    case "FeedbackRevoked":
      await tx`update idx_agent_feedback set revoked = true
        where registry = ${e.address} and agent_id = ${str(d, "agentId")}::numeric and client = ${addr(d, "clientAddress")} and feedback_index = ${str(d, "feedbackIndex")}::bigint`;
      return true;
    default:
      return false;
  }
}
