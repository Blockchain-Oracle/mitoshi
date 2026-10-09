import "server-only";
/**
 * The money-history reader behind `/api/activity` (RV-81, §8 "Money"). Each call scans forward to the head, then backward
 * toward Mitoshi's first deployment on the chain for at most `BACKWARD_WINDOWS` × 100k blocks, persisting the covered
 * range and the pathUSD transfers in Postgres (the `/api/keys` pattern, D-053) — so a first visit fills in over a poll or
 * two and later visits cost one window. One scan per account at a time per process.
 */
import { TEMPO } from "@cwf/clients";
import { createPgTransferStore, type TransferStore } from "@cwf/db";
import { activityFloorBlock, activityRows, counterpartiesOf, LOG_WINDOW, scanTransfers, type ActivityRow } from "@cwf/markets";
import type { Address, PublicClient } from "viem";
import { db } from "./db";
import { chainClient } from "./faucet";

const BACKWARD_WINDOWS = 12n;
/** Transfers folded per answer: enough for the newest rows of a busy self-paying wallet. */
const READ_LIMIT = 2_000;
const SHOWN = 100;
const TOKEN = TEMPO.pathUSD as Address;
const inflight = new Map<string, Promise<void>>();
let store: TransferStore | null = null;

export interface ActivityReport {
  rows: ActivityRow[];
  coverage: { fromBlock: bigint; toBlock: bigint; complete: boolean; fromTimeSec: bigint | null };
}

async function advance(client: PublicClient, chainId: number, account: Address, floor: bigint): Promise<void> {
  const s = (store ??= createPgTransferStore(db()));
  const head = await client.getBlockNumber();
  const range = (await s.range(chainId, account, TOKEN)) ?? { lo: head + 1n, hi: head };
  if (range.hi < head) {
    const transfers = await scanTransfers(client, TOKEN, account, range.hi + 1n, head);
    await s.save(chainId, account, TOKEN, { lo: range.hi + 1n, hi: head }, transfers, Date.now());
  }
  if (range.lo > floor) {
    const lo = range.lo - BACKWARD_WINDOWS * LOG_WINDOW < floor ? floor : range.lo - BACKWARD_WINDOWS * LOG_WINDOW;
    const transfers = await scanTransfers(client, TOKEN, account, lo, range.lo - 1n);
    await s.save(chainId, account, TOKEN, { lo, hi: range.lo - 1n }, transfers, Date.now());
  }
}

export async function activityReport(account: Address): Promise<ActivityReport> {
  const client = chainClient();
  const chainId = client.chain!.id;
  const floor = activityFloorBlock(chainId) ?? 0n;
  const key = `${chainId}:${account.toLowerCase()}`;
  let run = inflight.get(key);
  if (!run) {
    run = advance(client, chainId, account, floor).finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  await run;
  const s = (store ??= createPgTransferStore(db()));
  const [range, transfers] = await Promise.all([s.range(chainId, account, TOKEN), s.transfers(chainId, account, TOKEN, READ_LIMIT)]);
  const rows = activityRows(transfers, account, counterpartiesOf(chainId)).slice(0, SHOWN);
  const fromBlock = range?.lo ?? floor;
  const fromTimeSec = await client.getBlock({ blockNumber: fromBlock }).then((b) => b.timestamp).catch(() => null);
  return { rows, coverage: { fromBlock, toBlock: range?.hi ?? 0n, complete: fromBlock <= floor, fromTimeSec } };
}
