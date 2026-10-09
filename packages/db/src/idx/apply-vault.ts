/**
 * Projection writes for one decoded EventVault event (index/0002; plan C.4.2 `idx_vault_*`). Runs inside the writer's DB
 * transaction; the vault's events are stored with `market` NULL, so each is applied exactly once and in (block, log
 * index) order (the writer applies an event only when its `idx_events` row is newly inserted). Balance moves are the
 * contract's own arithmetic (EventVault.sol): a deposit, credit or withdrawal states the new balance; a grant takes its
 * budget from `available` and a revoke returns what is left; the owner's own buy spends `available`, a grant's buy
 * spends its budget; every sale and every settlement pays `available`. Every row is keyed by its vault (the event's
 * address; index/0004, S24.2): v1 and v2 each number their grants and hold their own balances. `ExitGranted` (v2) marks
 * the EXIT grant's tolerance.
 */
import type postgres from "postgres";
import type { IdxEvent } from "./types";

type Tx = postgres.TransactionSql;
type Data = Record<string, unknown>;

export const VAULT_EVENTS: ReadonlySet<string> = new Set([
  "Deposited", "Credited", "Withdrawn", "PrivateMoved", "PrivateCredited", "PrivateWithdrawn",
  "GrantCreated", "GrantFunded", "GrantRevoked", "Executed", "Settled", "Swept", "ExitGranted",
]);

const str = (d: Data, key: string): string => {
  const v = d[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  throw new Error(`vault event field ${key} missing`);
};
const addr = (d: Data, key: string) => str(d, key).toLowerCase();
const ZERO_MARKET = `0x${"0".repeat(64)}`;

/** Upserts the owner's row and moves one bucket: `set` states the new value, `add` moves it by a signed amount. */
async function account(tx: Tx, vault: string, owner: string, block: number, move: { available?: { set?: string; add?: string }; private?: { set?: string; add?: string }; deposited?: string; withdrawn?: string }) {
  await tx`insert into idx_vault_accounts (vault, owner, updated_block) values (${vault}, ${owner}, ${block}) on conflict (vault, owner) do nothing`;
  const a = move.available;
  const p = move.private;
  await tx`
    update idx_vault_accounts set
      available_base = ${a?.set !== undefined ? tx`${a.set}::numeric` : a?.add !== undefined ? tx`available_base + ${a.add}::numeric` : tx`available_base`},
      private_available_base = ${p?.set !== undefined ? tx`${p.set}::numeric` : p?.add !== undefined ? tx`private_available_base + ${p.add}::numeric` : tx`private_available_base`},
      deposited_base = deposited_base + ${move.deposited ?? "0"}::numeric,
      withdrawn_base = withdrawn_base + ${move.withdrawn ?? "0"}::numeric,
      updated_block = ${block}
    where vault = ${vault} and owner = ${owner}`;
}

async function ownerOfGrant(tx: Tx, vault: string, grantId: string): Promise<string | null> {
  const [row] = await tx<{ owner: string }[]>`select owner from idx_vault_grants where vault = ${vault} and grant_id = ${grantId}::bigint`;
  return row?.owner ?? null;
}

async function grantCreated(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const caps = d.caps as Data;
  const owner = addr(d, "owner");
  const market = str(caps, "market").toLowerCase();
  await tx`
    insert into idx_vault_grants (vault, grant_id, owner, actor, kind, max_stake_per_trade_base, max_daily_spend_base, max_open_positions, max_price_raw, market,
      expires_at_sec, budget_base, created_tx, created_block, created_at_sec)
    values (${e.address}, ${str(d, "grantId")}::bigint, ${owner}, ${addr(d, "actor")}, ${Number(str(d, "kind"))}, ${str(caps, "maxStakePerTrade")}::numeric, ${str(caps, "maxDailySpend")}::numeric,
      ${Number(str(caps, "maxOpenPositions"))}, ${str(caps, "maxPriceRaw")}::numeric, ${market === ZERO_MARKET ? null : market}, ${str(d, "expiresAtSec")}::bigint, ${str(d, "budget")}::numeric,
      ${e.txHash}, ${e.blockNumber}, ${e.blockTimeSec})
    on conflict (vault, grant_id) do nothing`;
  await account(tx, e.address, owner, e.blockNumber, { available: { add: `-${str(d, "budget")}` } });
}

async function executed(tx: Tx, e: IdxEvent) {
  const d = e.data;
  const owner = addr(d, "owner");
  const grantId = str(d, "grantId");
  const isBuy = d.isBuy === true;
  const cash = str(d, "cashDelta");
  await tx`
    insert into idx_vault_executions (tx_hash, log_index, vault, block_number, owner, market, grant_id, outcome_idx, is_buy, cash_delta, token_delta, actor, at_sec)
    values (${e.txHash}, ${e.logIndex}, ${e.address}, ${e.blockNumber}, ${owner}, ${str(d, "marketId").toLowerCase()}, ${grantId}::bigint, ${Number(str(d, "outcomeIdx"))}, ${isBuy},
      ${cash}::numeric, ${str(d, "tokenDelta")}::numeric, ${addr(d, "actor")}, ${str(d, "atSec")}::bigint)
    on conflict do nothing`;
  if (!isBuy) return account(tx, e.address, owner, e.blockNumber, { available: { add: cash } });
  if (grantId === "0") return account(tx, e.address, owner, e.blockNumber, { available: { add: `-${cash}` } });
  await tx`
    update idx_vault_grants set budget_base = budget_base - ${cash}::numeric, spent_base = spent_base + ${cash}::numeric, taps = taps + 1,
      last_used_tx = ${e.txHash}, last_used_at_sec = ${e.blockTimeSec}
    where vault = ${e.address} and grant_id = ${grantId}::bigint`;
}

/** Applies one vault event; returns false for a name this module does not own. */
export async function applyVaultEvent(tx: Tx, e: IdxEvent): Promise<boolean> {
  const d = e.data;
  switch (e.name) {
    case "Deposited":
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { available: { set: str(d, "available") }, deposited: str(d, "amount") });
      return true;
    case "Credited":
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { available: { set: str(d, "available") }, deposited: str(d, "amount") });
      return true;
    case "Withdrawn":
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { available: { set: str(d, "available") }, withdrawn: str(d, "amount") });
      return true;
    case "PrivateMoved":
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { available: { add: `-${str(d, "amount")}` }, private: { set: str(d, "privateAvailable") } });
      return true;
    case "PrivateCredited":
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { private: { set: str(d, "privateAvailable") }, deposited: str(d, "amount") });
      return true;
    case "PrivateWithdrawn":
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { private: { set: str(d, "privateAvailable") }, withdrawn: str(d, "amount") });
      return true;
    case "GrantCreated":
      await grantCreated(tx, e);
      return true;
    case "GrantFunded": {
      const grantId = str(d, "grantId");
      await tx`update idx_vault_grants set budget_base = ${str(d, "budget")}::numeric, funded_base = funded_base + ${str(d, "amount")}::numeric where vault = ${e.address} and grant_id = ${grantId}::bigint`;
      const owner = await ownerOfGrant(tx, e.address, grantId);
      if (owner) await account(tx, e.address, owner, e.blockNumber, { available: { add: `-${str(d, "amount")}` } });
      return true;
    }
    case "GrantRevoked":
      await tx`
        update idx_vault_grants set revoked = true, returned_base = ${str(d, "returned")}::numeric, budget_base = 0, revoked_tx = ${e.txHash}, revoked_at_sec = ${e.blockTimeSec}
        where vault = ${e.address} and grant_id = ${str(d, "grantId")}::bigint`;
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { available: { add: str(d, "returned") } });
      return true;
    case "Executed":
      await executed(tx, e);
      return true;
    case "Settled":
      await tx`
        insert into idx_vault_settlements (tx_hash, log_index, vault, block_number, owner, market, payout_base, yes_redeemed, no_redeemed, settled_by, at_sec)
        values (${e.txHash}, ${e.logIndex}, ${e.address}, ${e.blockNumber}, ${addr(d, "owner")}, ${str(d, "marketId").toLowerCase()}, ${str(d, "payout")}::numeric,
          ${str(d, "yesRedeemed")}::numeric, ${str(d, "noRedeemed")}::numeric, ${addr(d, "by")}, ${str(d, "atSec")}::bigint)
        on conflict do nothing`;
      await account(tx, e.address, addr(d, "owner"), e.blockNumber, { available: { add: str(d, "payout") } });
      return true;
    case "Swept":
      return true;
    case "ExitGranted":
      // Follows `GrantCreated` in the same transaction (v2's `grantExit`): what the floor is taken under — the tolerance,
      // and since D-213 the absolute slack (a retired v2's event has none).
      await tx`update idx_vault_grants set exit_tolerance_bps = ${Number(str(d, "toleranceBps"))}, exit_slack_bps = ${d.slackBps === undefined ? null : Number(str(d, "slackBps"))}
        where vault = ${e.address} and grant_id = ${str(d, "grantId")}::bigint`;
      return true;
    default:
      return false;
  }
}
