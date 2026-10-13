// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/idx/apply.ts — fills arrive as their own
// `Fill` logs (E-61) instead of a list inside the placement record; seats and Books are gone.
/**
 * Projection writes for one decoded engine event (index/0001). Runs inside the writer's DB transaction and assumes a
 * Market's events arrive in `seq` order; the writer rebuilds a Market whose events arrived out of order. Idempotent at
 * the event level: the writer applies an event only when its `idx_events` row was newly inserted.
 */
import type postgres from "postgres";
import type { IdxEvent } from "./types";
import { applyStrategyEvent, FEEDBACK_EVENTS, STRATEGY_EVENTS } from "./apply-strategies";
import { applyVaultEvent, VAULT_EVENTS } from "./apply-vault";
import { applyBridgeEvent, BRIDGE_EVENTS } from "./apply-bridge";

type Tx = postgres.TransactionSql;
type Data = Record<string, unknown>;
const PAIR_TICKS = 1000n;

const str = (d: Data, key: string): string => {
  const v = d[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  throw new Error(`event field ${key} missing`);
};
const num = (d: Data, key: string): number => Number(str(d, key));
const bool = (d: Data, key: string): boolean => d[key] === true;
const addr = (d: Data, key: string): string => str(d, key).toLowerCase();

/** Kind → outcome delta and YES-terms cash for one fill leg at maker price `price` (engine §2.1). */
export function leg(kind: number, lots: bigint, price: bigint) {
  const yesCash = lots * price;
  const noCash = lots * (PAIR_TICKS - price);
  switch (kind) {
    case 0: return { yes: lots, no: 0n, boughtYes: lots, soldYes: 0n, boughtNo: 0n, soldNo: 0n, paid: yesCash, received: 0n };
    case 1: return { yes: -lots, no: 0n, boughtYes: 0n, soldYes: lots, boughtNo: 0n, soldNo: 0n, paid: 0n, received: yesCash };
    case 2: return { yes: 0n, no: lots, boughtYes: 0n, soldYes: 0n, boughtNo: lots, soldNo: 0n, paid: noCash, received: 0n };
    case 3: return { yes: 0n, no: -lots, boughtYes: 0n, soldYes: 0n, boughtNo: 0n, soldNo: lots, paid: 0n, received: noCash };
    default: throw new Error(`unknown kind ${kind}`);
  }
}

async function positionFill(tx: Tx, e: IdxEvent, owner: string, kind: number, lots: bigint, price: bigint) {
  const l = leg(kind, lots, price);
  await tx`
    insert into idx_positions (market, owner, yes_lots, no_lots, bought_yes_lots, sold_yes_lots, bought_no_lots, sold_no_lots,
      paid_ticklots, received_ticklots, fills, first_ts_sec, last_ts_sec, entry_tx, last_tx)
    values (${e.market}, ${owner}, ${String(l.yes)}::numeric, ${String(l.no)}::numeric, ${String(l.boughtYes)}::numeric, ${String(l.soldYes)}::numeric,
      ${String(l.boughtNo)}::numeric, ${String(l.soldNo)}::numeric, ${String(l.paid)}::numeric, ${String(l.received)}::numeric, 1, ${e.blockTimeSec}, ${e.blockTimeSec},
      ${e.txHash}, ${e.txHash})
    on conflict (market, owner) do update set
      yes_lots = idx_positions.yes_lots + excluded.yes_lots, no_lots = idx_positions.no_lots + excluded.no_lots,
      bought_yes_lots = idx_positions.bought_yes_lots + excluded.bought_yes_lots, sold_yes_lots = idx_positions.sold_yes_lots + excluded.sold_yes_lots,
      bought_no_lots = idx_positions.bought_no_lots + excluded.bought_no_lots, sold_no_lots = idx_positions.sold_no_lots + excluded.sold_no_lots,
      paid_ticklots = idx_positions.paid_ticklots + excluded.paid_ticklots, received_ticklots = idx_positions.received_ticklots + excluded.received_ticklots,
      fills = idx_positions.fills + 1, first_ts_sec = coalesce(idx_positions.first_ts_sec, excluded.first_ts_sec), last_ts_sec = excluded.last_ts_sec,
      entry_tx = coalesce(idx_positions.entry_tx, excluded.entry_tx), last_tx = excluded.last_tx`;
}

async function fill(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const lots = BigInt(str(d, "lots"));
  const price = BigInt(str(d, "priceTicks"));
  const remaining = str(d, "makerRemaining");
  const orderId = str(d, "makerOrderId");
  await tx`
    insert into idx_fills (chain_id, tx_hash, log_index, market, seq, block_number, ts_sec, taker, taker_kind, maker, maker_kind, maker_order_id, path, price_ticks, lots, maker_remaining)
    values (${e.chainId}, ${e.txHash}, ${e.logIndex}, ${e.market}, ${e.seq}::bigint, ${e.blockNumber}, ${e.blockTimeSec}, ${addr(d, "taker")}, ${num(d, "takerKind")},
      ${addr(d, "maker")}, ${num(d, "makerKind")}, ${orderId}::numeric, ${num(d, "path")}, ${Number(price)}, ${String(lots)}::numeric, ${remaining}::numeric)
    on conflict do nothing`;
  await tx`
    update idx_orders set remaining_lots = ${remaining}::numeric, status = case when ${remaining}::numeric = 0 then 'filled' else status end, updated_seq = ${e.seq}::bigint
    where market = ${e.market} and rested_order_id = ${orderId}::numeric and status = 'open'`;
  await positionFill(tx, e, addr(d, "taker"), num(d, "takerKind"), lots, price);
  await positionFill(tx, e, addr(d, "maker"), num(d, "makerKind"), lots, price);
  const bucket = Math.floor(e.blockTimeSec / 60) * 60;
  await tx`
    insert into idx_candles (market, bucket_sec, open_ticks, high_ticks, low_ticks, close_ticks, volume_lots, trades)
    values (${e.market}, ${bucket}, ${Number(price)}, ${Number(price)}, ${Number(price)}, ${Number(price)}, ${String(lots)}::numeric, 1)
    on conflict (market, bucket_sec) do update set high_ticks = greatest(idx_candles.high_ticks, excluded.high_ticks),
      low_ticks = least(idx_candles.low_ticks, excluded.low_ticks), close_ticks = excluded.close_ticks,
      volume_lots = idx_candles.volume_lots + excluded.volume_lots, trades = idx_candles.trades + 1`;
  await tx`
    update idx_markets set volume_lots = volume_lots + ${String(lots)}::numeric, volume_ticklots = volume_ticklots + ${String(lots * price)}::numeric,
      trade_count = trade_count + 1, last_price_ticks = ${Number(price)}, last_trade_sec = ${e.blockTimeSec}
    where market = ${e.market}`;
}

async function orderExecuted(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const r = d.result as Data;
  const rested = BigInt(str(r, "restedLots"));
  await tx`
    insert into idx_orders (chain_id, tx_hash, log_index, market, seq, ts_sec, owner, kind, order_type, limit_price, lots, expire_ts_sec, client_id,
      filled_lots, cash_spent_base, cash_received_base, cancelled_lots, stop_reason, rested_order_id, rested_lots, remaining_lots, status, updated_seq)
    values (${e.chainId}, ${e.txHash}, ${e.logIndex}, ${e.market}, ${e.seq}::bigint, ${e.blockTimeSec}, ${addr(d, "taker")}, ${num(d, "kind")}, ${num(d, "orderType")},
      ${num(d, "limitTicks")}, ${str(d, "lots")}::numeric, ${str(d, "expireTs")}::bigint, ${str(d, "clientId")}::numeric, ${str(r, "filledLots")}::numeric,
      ${str(r, "cashSpent")}::numeric, ${str(r, "cashReceived")}::numeric, ${str(r, "cancelledLots")}::numeric, ${num(r, "stopReason")},
      ${rested > 0n ? str(r, "restedOrderId") : null}::numeric, ${String(rested)}::numeric, ${String(rested)}::numeric, ${rested > 0n ? "open" : "done"}, ${e.seq}::bigint)
    on conflict do nothing`;
  await tx`update idx_markets set backing_lots = ${str(d, "backingLots")}::numeric where market = ${e.market}`;
}

async function windowOpened(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const series = str(d, "seriesId").toLowerCase();
  await tx`
    update idx_markets m set series = ${series}, market_index = ${str(d, "index")}::bigint, m_idx = ${num(d, "mIdx")},
      trading_start_sec = ${str(d, "tradingStart")}::bigint, lock_at_sec = ${str(d, "lockAt")}::bigint, expiry_sec = ${str(d, "expiry")}::bigint,
      open_deadline_sec = ${str(d, "openDeadline")}::bigint, close_deadline_sec = ${str(d, "closeDeadline")}::bigint, policy_version = ${num(d, "policyVersion")},
      open_kind = ${num(d, "openKind")}, close_kind = ${num(d, "closeKind")}, basis = ${num(d, "basis")}, opened_tx = ${e.txHash}, opened_block_time_sec = ${e.blockTimeSec},
      symbol = (select symbol from idx_series where series = ${series}), cadence_sec = (select cadence_sec from idx_series where series = ${series})
    where m.market = ${e.market}`;
}

async function completeSet(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const lots = str(d, "lots");
  const minted = bool(d, "minted");
  const sign = minted ? "" : "-";
  await tx`
    insert into idx_positions (market, owner, yes_lots, no_lots, minted_lots, merged_lots, set_paid_base, set_received_base, withdrawn_base, first_ts_sec, last_ts_sec, entry_tx, last_tx)
    values (${e.market}, ${addr(d, "owner")}, ${sign + lots}::numeric, ${sign + lots}::numeric, ${minted ? lots : "0"}::numeric, ${minted ? "0" : lots}::numeric,
      ${minted ? str(d, "cash") : "0"}::numeric, ${minted ? "0" : str(d, "cash")}::numeric, ${str(d, "withdrawn")}::numeric, ${e.blockTimeSec}, ${e.blockTimeSec}, ${e.txHash}, ${e.txHash})
    on conflict (market, owner) do update set yes_lots = idx_positions.yes_lots + excluded.yes_lots, no_lots = idx_positions.no_lots + excluded.no_lots,
      minted_lots = idx_positions.minted_lots + excluded.minted_lots, merged_lots = idx_positions.merged_lots + excluded.merged_lots,
      set_paid_base = idx_positions.set_paid_base + excluded.set_paid_base, set_received_base = idx_positions.set_received_base + excluded.set_received_base,
      withdrawn_base = idx_positions.withdrawn_base + excluded.withdrawn_base,
      first_ts_sec = coalesce(idx_positions.first_ts_sec, excluded.first_ts_sec), last_ts_sec = excluded.last_ts_sec,
      entry_tx = coalesce(idx_positions.entry_tx, excluded.entry_tx), last_tx = excluded.last_tx`;
  await tx`update idx_markets set backing_lots = ${str(d, "backingLots")}::numeric where market = ${e.market}`;
}

async function redeemed(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const holder = addr(d, "holder");
  const partial = bool(d, "isPartial");
  const held = bool(d, "heldAsCredit");
  const byCrank = addr(d, "by") !== holder;
  await tx`
    insert into idx_redemptions (chain_id, tx_hash, log_index, market, holder, by_address, yes_lots, no_lots, payout_base, credit_base, total_base, is_partial, held_as_credit, ts_sec)
    values (${e.chainId}, ${e.txHash}, ${e.logIndex}, ${e.market}, ${holder}, ${addr(d, "by")}, ${str(d, "yesLots")}::numeric, ${str(d, "noLots")}::numeric,
      ${str(d, "payout")}::numeric, ${str(d, "credit")}::numeric, ${str(d, "total")}::numeric, ${partial}, ${held}, ${e.blockTimeSec})
    on conflict do nothing`;
  await tx`
    insert into idx_positions (market, owner, redeemed_base, payout_base, held_credit_base, redeemed, redeemed_by_crank, last_ts_sec, last_tx)
    values (${e.market}, ${holder}, ${held ? "0" : str(d, "total")}::numeric, ${str(d, "payout")}::numeric, ${held ? str(d, "total") : "0"}::numeric, ${!partial}, ${byCrank}, ${e.blockTimeSec}, ${e.txHash})
    on conflict (market, owner) do update set
      yes_lots = idx_positions.yes_lots - ${str(d, "yesLots")}::numeric, no_lots = idx_positions.no_lots - ${str(d, "noLots")}::numeric,
      redeemed_base = idx_positions.redeemed_base + excluded.redeemed_base, payout_base = idx_positions.payout_base + excluded.payout_base,
      held_credit_base = idx_positions.held_credit_base + excluded.held_credit_base, redeemed = idx_positions.redeemed or excluded.redeemed,
      redeemed_by_crank = idx_positions.redeemed_by_crank or excluded.redeemed_by_crank, last_ts_sec = excluded.last_ts_sec, last_tx = excluded.last_tx`;
  if (held) {
    await tx`insert into idx_credits (market, holder, held_base) values (${e.market}, ${holder}, ${str(d, "total")}::numeric)
      on conflict (market, holder) do update set held_base = idx_credits.held_base + excluded.held_base`;
  }
}

/** Applies one engine event's projections; engine-wide events update their own tables; unknown names are stored raw only. */
export async function applyEvent(tx: Tx, e: IdxEvent): Promise<void> {
  // The EventVault's events (index/0002, S7) have their own projections; they carry no engine `seq`.
  if (VAULT_EVENTS.has(e.name)) {
    await applyVaultEvent(tx, e);
    return;
  }
  // The bridge adapters' mints, burns and held credits (index/0007, R4-12): no engine `seq`; no other source emits these.
  if (e.market === null && BRIDGE_EVENTS.has(e.name)) {
    await applyBridgeEvent(tx, e);
    return;
  }
  // The StrategyRegistry's and ERC-8004 feedback (index/0006, S9): no engine `seq` either; no other source emits these names.
  if (e.market === null && (STRATEGY_EVENTS.has(e.name) || FEEDBACK_EVENTS.has(e.name))) {
    await applyStrategyEvent(tx, e);
    return;
  }
  const d = e.data;
  if (e.name === "SeriesRegistered") return; // written by the writer with the registry symbol (upsertSeries)
  if (e.name === "CrankOptOutSet") {
    await tx`insert into idx_crank_opt_outs (holder, opted_out, block_number) values (${addr(d, "holder")}, ${bool(d, "optedOut")}, ${e.blockNumber})
      on conflict (holder) do update set opted_out = excluded.opted_out, block_number = excluded.block_number where idx_crank_opt_outs.block_number <= excluded.block_number`;
    return;
  }
  if (!e.market || e.seq === null) return;
  await tx`
    insert into idx_markets (market, last_seq, last_block) values (${e.market}, ${e.seq}::bigint, ${e.blockNumber})
    on conflict (market) do update set last_seq = greatest(idx_markets.last_seq, excluded.last_seq), last_block = greatest(idx_markets.last_block, excluded.last_block)`;
  switch (e.name) {
    case "WindowOpened":
      return windowOpened(tx, e);
    case "PrintRecorded":
      await tx`
        insert into idx_prints (market, which, source, price_e8, source_ts_sec, signers, copied, recorded_ts_sec, tx_hash)
        values (${e.market}, ${num(d, "which")}, ${num(d, "source")}, ${str(d, "priceE8")}::bigint, ${str(d, "sourceTs")}::bigint, ${num(d, "signers")},
          ${bool(d, "copied")}, ${e.blockTimeSec}, ${e.txHash})
        on conflict (market, which) do nothing`;
      return;
    case "OrderExecuted":
      return orderExecuted(tx, e);
    case "Fill":
      return fill(tx, e);
    case "OrderRemoved": {
      const reason = num(d, "reason");
      await tx`
        update idx_orders set remaining_lots = 0, status = ${reason === 0 ? "expired" : "cancelled"}, removed_reason = ${reason}, updated_seq = ${e.seq}::bigint
        where market = ${e.market} and rested_order_id = ${str(d, "orderId")}::numeric and status = 'open'`;
      return;
    }
    case "OrderReduced":
      await tx`update idx_orders set remaining_lots = ${str(d, "newLots")}::numeric, updated_seq = ${e.seq}::bigint
        where market = ${e.market} and rested_order_id = ${str(d, "orderId")}::numeric and status = 'open'`;
      return;
    case "CompleteSet":
      return completeSet(tx, e);
    case "CreditWithdrawn":
      await tx`
        insert into idx_positions (market, owner, withdrawn_base, last_ts_sec, last_tx) values (${e.market}, ${addr(d, "owner")}, ${str(d, "amount")}::numeric, ${e.blockTimeSec}, ${e.txHash})
        on conflict (market, owner) do update set withdrawn_base = idx_positions.withdrawn_base + excluded.withdrawn_base, last_ts_sec = excluded.last_ts_sec, last_tx = excluded.last_tx`;
      await tx`insert into idx_credits (market, holder, withdrawn_base) values (${e.market}, ${addr(d, "owner")}, ${str(d, "amount")}::numeric)
        on conflict (market, holder) do update set withdrawn_base = idx_credits.withdrawn_base + excluded.withdrawn_base`;
      return;
    case "WindowResolved":
      await tx`
        update idx_markets set state = ${num(d, "state") === 1 ? "resolved" : "voided"}, winner = ${num(d, "winner")}, payout_yes = ${num(d, "payoutYes")},
          payout_no = ${num(d, "payoutNo")}, void_reason = ${num(d, "voidReason")}, single_source = ${bool(d, "singleSource")},
          open_e8 = ${str(d, "openE8")}::bigint, close_e8 = ${str(d, "closeE8")}::bigint, resolved_ts_sec = ${e.blockTimeSec}, resolved_tx = ${e.txHash}
        where market = ${e.market}`;
      return;
    case "Redeemed":
      return redeemed(tx, e);
  }
}
