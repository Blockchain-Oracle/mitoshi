/** The exit keeper's triggers over Postgres (S24.3; `migrations/exits`). Shapes and the signature live in `@cwf/core/exits`. */
import type { Side } from "@cwf/core";
import { isExitCancel, type ExitReason, type ExitTrigger } from "@cwf/core/exits";
import type { Sql } from "./index";

export type ExitTriggerStatus = "armed" | "firing" | "fired" | "cancelled" | "expired" | "gone";

export interface ExitTriggerRow {
  id: number;
  chainId: number;
  vault: string;
  owner: string;
  market: string;
  side: Side;
  grantId: bigint;
  signer: string;
  takeProfitBase: bigint | null;
  stopLossBase: bigint | null;
  trailBps: number | null;
  /** The stop now: the signed one, moved by the keeper in the position's favour. */
  trailStopE8: bigint | null;
  signedTrailStopE8: bigint | null;
  nonce: bigint;
  expiresAtSec: number;
  signature: string;
  status: ExitTriggerStatus;
  reason: ExitReason | null;
  attempts: number;
  lastError: string | null;
  fireTx: string | null;
  firingSinceMs: number | null;
  proceedsBase: bigint | null;
  contractsRaw: bigint | null;
  createdAtMs: number;
  updatedAtMs: number;
  firedAtMs: number | null;
}

/** Why a write was not stored: an older or equal nonce, or the keeper is selling the position right now. */
export type ExitWriteConflict = "stale-nonce" | "firing";

export interface ExitTriggersStore {
  write(input: { trigger: ExitTrigger; signer: string; signature: string; nowMs: number }): Promise<{ row: ExitTriggerRow } | { conflict: ExitWriteConflict }>;
  listByOwner(owner: string, limit?: number): Promise<ExitTriggerRow[]>;
  /** Armed rows that have not expired. */
  armed(nowSec: number): Promise<ExitTriggerRow[]>;
  /** Rows a keeper claimed and did not finish (a restart resumes them). */
  firing(): Promise<ExitTriggerRow[]>;
  /** armed → firing for this nonce, with why; false when the row moved on (replaced, cancelled, claimed). */
  claim(id: number, nonce: bigint, reason: ExitReason, nowMs: number): Promise<boolean>;
  setFireTx(id: number, txHash: string, nowMs: number): Promise<void>;
  markFired(id: number, fired: { txHash: string; proceedsBase: bigint; contractsRaw: bigint }, nowMs: number): Promise<void>;
  /** firing → armed, with why; the trigger stays live for the next pass. */
  release(id: number, error: string, nowMs: number): Promise<void>;
  /** A live row ends: its Window locked (`expired`) or nothing is held any more (`gone`). */
  close(id: number, status: "expired" | "gone", note: string, nowMs: number): Promise<void>;
  /**
   * Armed rows whose Window has passed end `expired` — `armed` never returns them again, so no pass would — keeping the
   * last reason the keeper waited, if any. How many ended.
   */
  expireLapsed(nowSec: number, nowMs: number): Promise<number>;
  /** The trail moved; ignored when the owner replaced the trigger meanwhile. */
  moveTrail(id: number, nonce: bigint, stopE8: bigint, nowMs: number): Promise<boolean>;
  /** Why an armed trigger is waiting (no live EXIT grant, no bid at the floor), kept for the owner to read. */
  note(id: number, nonce: bigint, error: string | null, nowMs: number): Promise<void>;
}

type Row = {
  id: string; chain_id: number; vault: string; owner: string; market: string; side: Side; grant_id: string; signer: string;
  take_profit_base: string | null; stop_loss_base: string | null; trail_bps: number | null; trail_stop_e8: string | null; signed_trail_stop_e8: string | null;
  nonce: string; expires_at_sec: string; signature: string; status: ExitTriggerStatus; reason: ExitReason | null; attempts: number; last_error: string | null;
  fire_tx: string | null; firing_since_ms: string | null; proceeds_base: string | null; contracts_raw: string | null; created_at_ms: string; updated_at_ms: string; fired_at_ms: string | null;
};

const big = (v: string | null) => (v === null ? null : BigInt(v));
const num = (v: string | null) => (v === null ? null : Number(v));

const toRow = (r: Row): ExitTriggerRow => ({
  id: Number(r.id), chainId: r.chain_id, vault: r.vault, owner: r.owner, market: r.market, side: r.side, grantId: BigInt(r.grant_id), signer: r.signer,
  takeProfitBase: big(r.take_profit_base), stopLossBase: big(r.stop_loss_base), trailBps: r.trail_bps, trailStopE8: big(r.trail_stop_e8), signedTrailStopE8: big(r.signed_trail_stop_e8),
  nonce: BigInt(r.nonce), expiresAtSec: Number(r.expires_at_sec), signature: r.signature, status: r.status, reason: r.reason, attempts: r.attempts, lastError: r.last_error,
  fireTx: r.fire_tx, firingSinceMs: num(r.firing_since_ms), proceedsBase: big(r.proceeds_base), contractsRaw: big(r.contracts_raw),
  createdAtMs: Number(r.created_at_ms), updatedAtMs: Number(r.updated_at_ms), firedAtMs: num(r.fired_at_ms),
});

const text = (v: bigint | null) => (v === null ? null : v.toString());

export function createPgExitTriggersStore(sql: Sql): ExitTriggersStore {
  return {
    async write({ trigger: t, signer, signature, nowMs }) {
      const status: ExitTriggerStatus = isExitCancel(t) ? "cancelled" : "armed";
      const key = { vault: t.vault.toLowerCase(), owner: t.owner.toLowerCase(), market: t.market.toLowerCase() };
      const rows = await sql<Row[]>`
        insert into exit_triggers (chain_id, vault, owner, market, side, grant_id, signer, take_profit_base, stop_loss_base, trail_bps,
          trail_stop_e8, signed_trail_stop_e8, nonce, expires_at_sec, signature, status, created_at_ms, updated_at_ms)
        values (${t.chainId}, ${key.vault}, ${key.owner}, ${key.market}, ${t.side}, ${t.grantId.toString()}, ${signer.toLowerCase()},
          ${text(t.takeProfitBase)}, ${text(t.stopLossBase)}, ${t.trailBps}, ${text(t.trailStopE8)}, ${text(t.trailStopE8)},
          ${t.nonce.toString()}, ${t.expiresAtSec}, ${signature}, ${status}, ${nowMs}, ${nowMs})
        on conflict (vault, owner, market, side) do update set
          chain_id = excluded.chain_id, grant_id = excluded.grant_id, signer = excluded.signer, take_profit_base = excluded.take_profit_base,
          stop_loss_base = excluded.stop_loss_base, trail_bps = excluded.trail_bps, trail_stop_e8 = excluded.trail_stop_e8,
          signed_trail_stop_e8 = excluded.signed_trail_stop_e8, nonce = excluded.nonce, expires_at_sec = excluded.expires_at_sec,
          signature = excluded.signature, status = excluded.status, reason = null, attempts = 0, last_error = null, fire_tx = null,
          firing_since_ms = null, proceeds_base = null, contracts_raw = null, fired_at_ms = null, updated_at_ms = excluded.updated_at_ms
        where exit_triggers.nonce < excluded.nonce and exit_triggers.status <> 'firing'
        returning *`;
      if (rows[0]) return { row: toRow(rows[0]) };
      const [held] = await sql<{ status: ExitTriggerStatus }[]>`select status from exit_triggers where vault = ${key.vault} and owner = ${key.owner} and market = ${key.market} and side = ${t.side}`;
      return { conflict: held?.status === "firing" ? "firing" : "stale-nonce" };
    },
    async listByOwner(owner, limit = 50) {
      return (await sql<Row[]>`select * from exit_triggers where owner = ${owner.toLowerCase()} order by updated_at_ms desc limit ${limit}`).map(toRow);
    },
    async armed(nowSec) {
      return (await sql<Row[]>`select * from exit_triggers where status = 'armed' and expires_at_sec > ${nowSec} order by id`).map(toRow);
    },
    async firing() {
      return (await sql<Row[]>`select * from exit_triggers where status = 'firing' order by id`).map(toRow);
    },
    async claim(id, nonce, reason, nowMs) {
      const rows = await sql`update exit_triggers set status = 'firing', reason = ${reason}, attempts = attempts + 1, fire_tx = null, firing_since_ms = ${nowMs}, updated_at_ms = ${nowMs}
        where id = ${id} and nonce = ${nonce.toString()} and status = 'armed' returning id`;
      return rows.length === 1;
    },
    async setFireTx(id, txHash, nowMs) {
      await sql`update exit_triggers set fire_tx = ${txHash}, updated_at_ms = ${nowMs} where id = ${id} and status = 'firing'`;
    },
    async markFired(id, f, nowMs) {
      await sql`update exit_triggers set status = 'fired', fire_tx = ${f.txHash}, proceeds_base = ${f.proceedsBase.toString()},
        contracts_raw = ${f.contractsRaw.toString()}, last_error = null, fired_at_ms = ${nowMs}, updated_at_ms = ${nowMs} where id = ${id} and status = 'firing'`;
    },
    async release(id, error, nowMs) {
      await sql`update exit_triggers set status = 'armed', reason = null, last_error = ${error.slice(0, 300)}, fire_tx = null, firing_since_ms = null, updated_at_ms = ${nowMs}
        where id = ${id} and status = 'firing'`;
    },
    async close(id, status, note, nowMs) {
      await sql`update exit_triggers set status = ${status}, last_error = ${note.slice(0, 300)}, firing_since_ms = null, updated_at_ms = ${nowMs}
        where id = ${id} and status in ('armed', 'firing')`;
    },
    async moveTrail(id, nonce, stopE8, nowMs) {
      const rows = await sql`update exit_triggers set trail_stop_e8 = ${stopE8.toString()}, updated_at_ms = ${nowMs}
        where id = ${id} and nonce = ${nonce.toString()} and status = 'armed' returning id`;
      return rows.length === 1;
    },
    async expireLapsed(nowSec, nowMs) {
      const ended = await sql`update exit_triggers
        set status = 'expired', last_error = left(case when last_error is null then 'the Window locked' else 'the Window locked · ' || last_error end, 300), updated_at_ms = ${nowMs}
        where status = 'armed' and expires_at_sec <= ${nowSec}`;
      return ended.count;
    },
    async note(id, nonce, error, nowMs) {
      await sql`update exit_triggers set last_error = ${error === null ? null : error.slice(0, 300)}, updated_at_ms = ${nowMs}
        where id = ${id} and nonce = ${nonce.toString()} and status = 'armed' and last_error is distinct from ${error === null ? null : error.slice(0, 300)}`;
    },
  };
}
