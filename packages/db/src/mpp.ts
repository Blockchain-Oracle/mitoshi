/** `mpp_receipts` writes and reads (migrations/mpp). The row shape matches `@cwf/markets/server` `MppReceiptRow`. */
import type { Sql } from "./index";

export interface MppReceiptInsert {
  chainId: number;
  host: string;
  path: string;
  method: string;
  intent: string;
  status: "paid" | "failed";
  challengeId: string;
  currency: string;
  amountBase: bigint;
  recipient: string | null;
  payer: string;
  reference: string | null;
  channelId: string | null;
  acceptedCumulativeBase: bigint | null;
  spentBase: bigint | null;
  scope: { decisionId?: string; rebalanceId?: string; senseiId?: string; purpose?: string };
  raw: unknown;
  receivedAtMs: number;
}

const num = (v: bigint | null) => (v === null ? null : v.toString());

/** Inserts one receipt; a charge reference already recorded is kept (retries are idempotent). Returns the row id or null. */
export async function insertMppReceipt(sql: Sql, row: MppReceiptInsert): Promise<string | null> {
  const raw = JSON.parse(JSON.stringify(row.raw ?? {}, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  const [inserted] = await sql<{ id: string }[]>`
    insert into mpp_receipts (chain_id, host, path, method, intent, status, challenge_id, currency, amount_base, recipient, payer,
      reference, channel_id, accepted_cumulative_base, spent_base, decision_id, rebalance_id, sensei_id, purpose, raw, received_at)
    values (${row.chainId}, ${row.host}, ${row.path}, ${row.method}, ${row.intent}, ${row.status}, ${row.challengeId},
      ${row.currency.toLowerCase()}, ${row.amountBase.toString()}, ${row.recipient?.toLowerCase() ?? null}, ${row.payer.toLowerCase()},
      ${row.reference}, ${row.channelId}, ${num(row.acceptedCumulativeBase)}, ${num(row.spentBase)},
      ${row.scope.decisionId ?? null}, ${row.scope.rebalanceId ?? null}, ${row.scope.senseiId ?? null}, ${row.scope.purpose ?? null},
      ${sql.json(raw)}, ${new Date(row.receivedAtMs)})
    on conflict do nothing
    returning id`;
  return inserted?.id ?? null;
}

export interface MppReceiptRecord {
  id: string;
  intent: string;
  status: string;
  host: string;
  currency: string;
  amountBase: bigint;
  reference: string | null;
  decisionId: string | null;
  receivedAt: Date;
}

/** Receipts paid for one decision (the board shows them beside the call, S9). */
export async function receiptsForDecision(sql: Sql, decisionId: string): Promise<MppReceiptRecord[]> {
  const rows = await sql<{ id: string; intent: string; status: string; host: string; currency: string; amount_base: string; reference: string | null; decision_id: string | null; received_at: Date }[]>`
    select id, intent, status, host, currency, amount_base::text, reference, decision_id, received_at
    from mpp_receipts where decision_id = ${decisionId} order by received_at`;
  return rows.map((r) => ({ id: r.id, intent: r.intent, status: r.status, host: r.host, currency: r.currency, amountBase: BigInt(r.amount_base), reference: r.reference, decisionId: r.decision_id, receivedAt: r.received_at }));
}
