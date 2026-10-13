/**
 * The bridge's transfers over Postgres (S14 14o; `migrations/bridge`; D-227 R4-12). `/api/bridge` records a transfer
 * the moment the source wallet returns its hash; ops `bridge-watch` advances it from LayerZero Scan and the chains;
 * the tracker, Recent, Portfolio's "In flight" row and `/status` read it. Addresses and hashes are stored lower-case.
 */
import type { BridgeAdvance, BridgeDirection, BridgeRowStatus, LegRecord, Network, TrackerPhase } from "@cwf/core";
import type { Sql } from "./index";

export type { BridgeAdvance, BridgeRowStatus, LegRecord };

export interface BridgeMessageRow {
  id: number;
  network: Network;
  direction: BridgeDirection;
  ticker: string;
  srcChainId: number;
  srcTx: string;
  sender: string;
  recipient: string;
  amountSD: bigint;
  status: BridgeRowStatus;
  phase: TrackerPhase;
  legs: LegRecord[];
  attempts: number;
  lastError: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deliveredAtMs: number | null;
  durationSec: number | null;
}

export interface TrackInput {
  network: Network;
  direction: BridgeDirection;
  ticker: string;
  srcChainId: number;
  srcTx: string;
  sender: string;
  recipient: string;
  amountSD: bigint;
  nowMs: number;
}

export interface BridgeStore {
  /** Idempotent on (source chain, source tx): a resend of the same hash returns the existing row. */
  track(input: TrackInput): Promise<BridgeMessageRow>;
  /** By a leg's guid or the source transaction hash. */
  find(key: string): Promise<BridgeMessageRow | null>;
  /** Transfers an address sent or receives, newest first. */
  listFor(address: string, limit?: number): Promise<BridgeMessageRow[]>;
  /** Rows bridge-watch still follows (pending, in flight, stuck, held until released), oldest update first. */
  open(limit?: number): Promise<BridgeMessageRow[]>;
  advance(id: number, next: BridgeAdvance, nowMs: number): Promise<void>;
  /** A pass that could not read the row (kept for the next one). */
  note(id: number, error: string, nowMs: number): Promise<void>;
  /** Measured whole-transfer durations, newest first (the route line's ETA). */
  durations(network: Network, direction: BridgeDirection, limit?: number): Promise<number[]>;
  /** The last delivery per direction (the `/status` pathway rows). */
  lastDelivered(network: Network): Promise<Partial<Record<BridgeDirection, number>>>;
}

type Row = {
  id: string; network: Network; direction: BridgeDirection; ticker: string; src_chain_id: number; src_tx: string; sender: string; recipient: string;
  amount_sd: string; status: BridgeRowStatus; phase: TrackerPhase; legs: LegRecord[]; attempts: number; last_error: string | null;
  created_at_ms: string; updated_at_ms: string; delivered_at_ms: string | null; duration_sec: number | null;
};

const toRow = (r: Row): BridgeMessageRow => ({
  id: Number(r.id), network: r.network, direction: r.direction, ticker: r.ticker, srcChainId: r.src_chain_id, srcTx: r.src_tx, sender: r.sender, recipient: r.recipient,
  amountSD: BigInt(r.amount_sd), status: r.status, phase: r.phase, legs: Array.isArray(r.legs) ? r.legs : [], attempts: r.attempts, lastError: r.last_error,
  createdAtMs: Number(r.created_at_ms), updatedAtMs: Number(r.updated_at_ms), deliveredAtMs: r.delivered_at_ms === null ? null : Number(r.delivered_at_ms), durationSec: r.duration_sec,
});

const OPEN = ["pending", "in-flight", "stuck", "deferred"] as const;

export function createPgBridgeStore(sql: Sql): BridgeStore {
  const json = (v: unknown) => sql.json(v as Parameters<typeof sql.json>[0]);
  return {
    async track(i) {
      const tx = i.srcTx.toLowerCase();
      await sql`insert into bridge_messages (network, direction, ticker, src_chain_id, src_tx, sender, recipient, amount_sd, status, phase, created_at_ms, updated_at_ms)
        values (${i.network}, ${i.direction}, ${i.ticker}, ${i.srcChainId}, ${tx}, ${i.sender.toLowerCase()}, ${i.recipient.toLowerCase()}, ${i.amountSD.toString()}, 'pending', 'sent', ${i.nowMs}, ${i.nowMs})
        on conflict (src_chain_id, src_tx) do nothing`;
      const [r] = await sql<Row[]>`select * from bridge_messages where src_chain_id = ${i.srcChainId} and src_tx = ${tx}`;
      return toRow(r!);
    },
    async find(key) {
      const k = key.toLowerCase();
      const [r] = await sql<Row[]>`select * from bridge_messages where src_tx = ${k} or guid1 = ${k} or guid2 = ${k} order by created_at_ms desc limit 1`;
      return r ? toRow(r) : null;
    },
    async listFor(address, limit = 20) {
      const a = address.toLowerCase();
      const rows = await sql<Row[]>`select * from bridge_messages where sender = ${a} or recipient = ${a} order by created_at_ms desc limit ${Math.min(limit, 100)}`;
      return rows.map(toRow);
    },
    async open(limit = 50) {
      const rows = await sql<Row[]>`select * from bridge_messages where status = any(${OPEN as unknown as string[]}::text[]) order by updated_at_ms asc limit ${limit}`;
      return rows.map(toRow);
    },
    async advance(id, next, nowMs) {
      const guid1 = next.legs[0]?.guid?.toLowerCase() ?? null;
      const guid2 = next.legs[1]?.guid?.toLowerCase() ?? null;
      await sql`update bridge_messages set status = ${next.status}, phase = ${next.phase}, legs = ${json(next.legs)}, guid1 = coalesce(${guid1}, guid1), guid2 = coalesce(${guid2}, guid2),
        last_error = ${next.lastError ?? null}, delivered_at_ms = coalesce(${next.deliveredAtMs ?? null}, delivered_at_ms), duration_sec = coalesce(${next.durationSec ?? null}, duration_sec),
        attempts = attempts + 1, updated_at_ms = ${nowMs} where id = ${id}`;
    },
    async note(id, error, nowMs) {
      await sql`update bridge_messages set last_error = ${error.slice(0, 300)}, attempts = attempts + 1, updated_at_ms = ${nowMs} where id = ${id}`;
    },
    async durations(network, direction, limit = 50) {
      const rows = await sql<{ duration_sec: number }[]>`select duration_sec from bridge_messages where network = ${network} and direction = ${direction} and status = 'delivered' and duration_sec is not null order by delivered_at_ms desc limit ${limit}`;
      return rows.map((r) => r.duration_sec);
    },
    async lastDelivered(network) {
      const rows = await sql<{ direction: BridgeDirection; at: string }[]>`select direction, max(delivered_at_ms) as at from bridge_messages where network = ${network} and status = 'delivered' group by direction`;
      return Object.fromEntries(rows.filter((r) => r.at !== null).map((r) => [r.direction, Number(r.at)]));
    },
  };
}
