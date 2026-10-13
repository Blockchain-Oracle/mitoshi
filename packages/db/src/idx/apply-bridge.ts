/**
 * Projection writes for one TIP20MintBurnAdapter event (index/0007; R4-12, D-227): the bridge's mints, burns and held
 * credits on Tempo, one row each, keyed by (tx, log index). Runs inside the writer's transaction and only for a newly
 * inserted `idx_events` row, so a replay never doubles a row.
 */
import type postgres from "postgres";
import type { IdxEvent } from "./types";

type Tx = postgres.TransactionSql;
type Data = Record<string, unknown>;

export const BRIDGE_EVENTS: ReadonlySet<string> = new Set(["OFTSent", "OFTReceived", "CreditDeferred", "DeferredClaimed", "DeferredSent"]);

const text = (d: Data, key: string): string | null => {
  const v = d[key];
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "bigint" ? String(v) : null;
};

/** The holder, the other endpoint, the amount and (deferrals) the reason, per event shape (TIP20MintBurnAdapter.sol). */
function fieldsOf(e: IdxEvent): { guid: string | null; account: string; eid: string | null; amount: string; reason: string | null } {
  const d = e.data;
  switch (e.name) {
    case "OFTSent":
      return { guid: text(d, "guid"), account: text(d, "fromAddress")!, eid: text(d, "dstEid"), amount: text(d, "amountSentLD")!, reason: null };
    case "OFTReceived":
      return { guid: text(d, "guid"), account: text(d, "toAddress")!, eid: text(d, "srcEid"), amount: text(d, "amountReceivedLD")!, reason: null };
    case "CreditDeferred":
      return { guid: null, account: text(d, "to")!, eid: text(d, "srcEid"), amount: text(d, "amountLD")!, reason: text(d, "reason") };
    case "DeferredClaimed":
      return { guid: null, account: text(d, "to")!, eid: null, amount: text(d, "amountLD")!, reason: null };
    default:
      return { guid: text(d, "guid"), account: text(d, "from")!, eid: text(d, "dstEid"), amount: text(d, "amountLD")!, reason: null };
  }
}

export async function applyBridgeEvent(tx: Tx, e: IdxEvent): Promise<void> {
  const f = fieldsOf(e);
  await tx`
    insert into idx_bridge_events (tx_hash, log_index, adapter, name, guid, account, eid, amount_sd, reason, block_number, block_time_sec)
    values (${e.txHash.toLowerCase()}, ${e.logIndex}, ${e.address.toLowerCase()}, ${e.name}, ${f.guid?.toLowerCase() ?? null}, ${f.account.toLowerCase()},
      ${f.eid === null ? null : Number(f.eid)}, ${f.amount}::numeric, ${f.reason === null ? null : Number(f.reason)}, ${e.blockNumber}, ${e.blockTimeSec})
    on conflict (tx_hash, log_index) do nothing`;
}
