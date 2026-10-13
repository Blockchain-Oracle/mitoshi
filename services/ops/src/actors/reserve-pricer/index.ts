/**
 * The reserve pricer (R6 money, S09; D-230): Earn's share-price history, from the chain. For each reserve Earn shows —
 * the maker vault and the Range, Parlay and Boost reserves — it backfills one sample an hour from the reserve's deploy
 * block (blocks per hour measured from two block timestamps, each sample stamped with its own block's time), resumable
 * from the newest stored block, then keeps one live sample every 10 minutes. Each sample is the reserve's sheet read at
 * that block (`readReserveSheetAt`, historical `eth_call`), written once per (reserve, block). Reads only; paced on the
 * ops RPC budget's bookkeeping tier. Heartbeat: "maker 341 h · range 9 h · parlay 334 h · boost 333 h · live".
 */
import { createPgReservePrices, type ReservePriceStore } from "@cwf/db";
import { blocksPerHour, createOpsClient, readReserveSheetAt, reserveVenuesOf, type OpsClient, type ReserveSample, type ReserveVenue } from "@cwf/markets/ops";
import { runActor, type PassResult, type VenueDeps } from "../../runtime";

export const RESERVE_PRICER_EVERY_MS = 60_000;
/** Samples one reserve reads per pass while it backfills (two RPC calls each). */
const BACKFILL_PER_PASS = 12;
const BACKFILL_DELAY_MS = 1_000;
/** A live sample is due when the newest is this many hours of blocks old (10 minutes). */
const LIVE_EVERY_DIVISOR = 6n;
/** Blocks per hour is re-measured this often. */
const PACE_MS = 6 * 3_600_000;

/** What one reserve still needs at `head`: the hourly backfill blocks (up to `limit`), else a live sample, else none. Pure. */
export function plan(newestBlock: bigint | null, deployBlock: bigint, head: bigint, bph: bigint, limit = BACKFILL_PER_PASS): { blocks: bigint[]; backfilling: boolean } {
  const liveGap = bph / LIVE_EVERY_DIVISOR;
  const blocks: bigint[] = [];
  let next = newestBlock === null ? deployBlock : newestBlock + bph;
  while (blocks.length < limit && next + liveGap <= head) {
    blocks.push(next);
    next += bph;
  }
  if (blocks.length > 0) return { blocks, backfilling: next + liveGap <= head };
  if (newestBlock === null || head - newestBlock >= liveGap) return { blocks: [head], backfilling: false };
  return { blocks: [], backfilling: false };
}

const toRow = (s: ReserveSample) => ({ ...s, reserve: s.reserve as string });

async function priceOne(client: OpsClient, store: ReservePriceStore, v: ReserveVenue, head: bigint, bph: bigint): Promise<{ line: string; backfilling: boolean; added: number }> {
  const newest = await store.newest(v.kind);
  const { blocks, backfilling } = plan(newest?.blockNumber ?? null, v.deployBlock, head, bph);
  const samples: ReserveSample[] = [];
  for (const b of blocks) samples.push(await readReserveSheetAt(client, v, b));
  const added = samples.length ? await store.insert(samples.map(toRow)) : 0;
  const oldest = await store.oldest(v.kind);
  const last = samples.at(-1) ?? newest;
  const hours = oldest && last ? Math.floor((last.atSec - oldest.atSec) / 3_600) : 0;
  return { line: `${v.kind} ${hours} h`, backfilling, added };
}

export function startReservePricer(deps: VenueDeps): { stop: () => void } {
  if (!deps.sql) throw new Error("reserve-pricer needs DATABASE_URL");
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, tier: 2 });
  const store = createPgReservePrices(deps.sql);
  const venues = reserveVenuesOf(client.chainId);
  let pace: { bph: bigint; atMs: number } | null = null;
  const pass = async (): Promise<PassResult> => {
    if (venues.length === 0) return { why: "no reserves on this network", nextDelayMs: 10 * RESERVE_PRICER_EVERY_MS };
    const head = await client.public.getBlockNumber();
    if (!pace || Date.now() - pace.atMs > PACE_MS) pace = { bph: await blocksPerHour(client, head), atMs: Date.now() };
    const lines: string[] = [];
    let backfilling = false;
    let added = 0;
    for (const v of venues) {
      const r = await priceOne(client, store, v, head, pace.bph);
      lines.push(r.line);
      backfilling ||= r.backfilling;
      added += r.added;
    }
    return {
      why: `${lines.join(" · ")} · ${backfilling ? "backfill" : "live"}`,
      detail: { head: Number(head), blocksPerHour: Number(pace.bph), added, backfilling },
      nextDelayMs: backfilling ? BACKFILL_DELAY_MS : RESERVE_PRICER_EVERY_MS,
    };
  };
  return runActor({ name: "reserve-pricer", log: deps.log, dryRun: false, everyMs: RESERVE_PRICER_EVERY_MS, critical: false, pass });
}
