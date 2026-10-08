/** The private desk's claims per account over Postgres (S10d; `migrations/private`). Pure shapes live in `@cwf/core/private`. */
import type { PrivateTicket } from "@cwf/core/private";
import type { Sql } from "./index";

export type PrivateClaimStatus = "pending" | "open" | "refused" | "credited";

export interface PrivateClaimRow {
  slotId: string;
  owner: string;
  chainId: number;
  status: PrivateClaimStatus;
  /** The signed open, kept only while the desk has not answered definitively (resume, never re-sign). */
  request: Record<string, unknown> | null;
  ticket: PrivateTicket | null;
  /** The desk's last answer (a refusal's reason, an unknown's, a cash-out's). */
  result: Record<string, unknown> | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PrivateClaimsStore {
  /** Records a signed open before the desk sends anything; an existing row (a resend) is left as it is. */
  savePending(input: { slotId: string; owner: string; chainId: number; request: Record<string, unknown>; nowMs: number }): Promise<void>;
  get(slotId: string): Promise<PrivateClaimRow | null>;
  markOpened(slotId: string, ticket: PrivateTicket, nowMs: number): Promise<void>;
  markRefused(slotId: string, result: Record<string, unknown>, nowMs: number): Promise<void>;
  /** The desk could not tell: the row stays pending with the request, and the answer is kept for the owner to read. */
  markUnknown(slotId: string, result: Record<string, unknown>, nowMs: number): Promise<void>;
  markCredited(slotId: string, ticket: PrivateTicket, result: Record<string, unknown>, nowMs: number): Promise<void>;
  listByOwner(owner: string, limit?: number): Promise<PrivateClaimRow[]>;
}

type Row = { slot_id: string; owner: string; chain_id: number; status: PrivateClaimStatus; request: Record<string, unknown> | null; ticket: PrivateTicket | null; result: Record<string, unknown> | null; created_at_ms: string; updated_at_ms: string };

const toRow = (r: Row): PrivateClaimRow => ({ slotId: r.slot_id, owner: r.owner, chainId: r.chain_id, status: r.status, request: r.request, ticket: r.ticket, result: r.result, createdAtMs: Number(r.created_at_ms), updatedAtMs: Number(r.updated_at_ms) });

export function createPgPrivateClaimsStore(sql: Sql): PrivateClaimsStore {
  const json = (v: unknown) => sql.json(v as Parameters<typeof sql.json>[0]);
  return {
    async savePending({ slotId, owner, chainId, request, nowMs }) {
      await sql`insert into private_claims (slot_id, owner, chain_id, status, request, created_at_ms, updated_at_ms)
        values (${slotId.toLowerCase()}, ${owner.toLowerCase()}, ${chainId}, 'pending', ${json(request)}, ${nowMs}, ${nowMs}) on conflict (slot_id) do nothing`;
    },
    async get(slotId) {
      const [r] = await sql<Row[]>`select * from private_claims where slot_id = ${slotId.toLowerCase()}`;
      return r ? toRow(r) : null;
    },
    async markOpened(slotId, ticket, nowMs) {
      await sql`update private_claims set status = 'open', ticket = ${json(ticket)}, request = null, result = null, updated_at_ms = ${nowMs} where slot_id = ${slotId.toLowerCase()}`;
    },
    async markRefused(slotId, result, nowMs) {
      await sql`update private_claims set status = 'refused', request = null, result = ${json(result)}, updated_at_ms = ${nowMs} where slot_id = ${slotId.toLowerCase()} and status = 'pending'`;
    },
    async markUnknown(slotId, result, nowMs) {
      await sql`update private_claims set result = ${json(result)}, updated_at_ms = ${nowMs} where slot_id = ${slotId.toLowerCase()} and status = 'pending'`;
    },
    async markCredited(slotId, ticket, result, nowMs) {
      await sql`update private_claims set status = 'credited', ticket = ${json(ticket)}, result = ${json(result)}, updated_at_ms = ${nowMs} where slot_id = ${slotId.toLowerCase()}`;
    },
    async listByOwner(owner, limit = 100) {
      const rows = await sql<Row[]>`select * from private_claims where owner = ${owner.toLowerCase()} order by created_at_ms desc limit ${limit}`;
      return rows.map(toRow);
    },
  };
}
