import "server-only";
/**
 * The keychain reader behind `/api/keys` (D-053). Each call scans forward to the head, then continues backward toward
 * genesis for at most `BACKWARD_WINDOWS` × 100k blocks, persisting the covered range and the events in Postgres — so
 * the first visit fills in over a few polls (~25 s for Moderato's full history) and later visits cost one window.
 * One scan per account at a time per process.
 */
import { createPgKeychainStore, type KeychainStore } from "@cwf/db";
import { foldKeychain, LOG_WINDOW, readKeyStates, scanKeychain, withAuthorizedLimits, type KeyState } from "@cwf/markets";
import type { Address, PublicClient } from "viem";
import { db } from "./db";
import { chainClient } from "./faucet";

const BACKWARD_WINDOWS = 60n;
const inflight = new Map<string, Promise<void>>();
let store: KeychainStore | null = null;

export interface KeysReport {
  keys: KeyState[];
  coverage: { fromBlock: bigint; toBlock: bigint; complete: boolean; fromTimeSec: bigint | null };
}

async function advance(client: PublicClient, chainId: number, account: Address): Promise<void> {
  const s = (store ??= createPgKeychainStore(db()));
  const head = await client.getBlockNumber();
  const range = (await s.range(chainId, account)) ?? { lo: head + 1n, hi: head };
  if (range.hi < head) {
    const events = await scanKeychain(client, account, range.hi + 1n, head);
    await s.save(chainId, account, { lo: range.hi + 1n, hi: head }, events, Date.now());
  }
  if (range.lo > 0n) {
    const lo = range.lo - BACKWARD_WINDOWS * LOG_WINDOW < 0n ? 0n : range.lo - BACKWARD_WINDOWS * LOG_WINDOW;
    const events = await scanKeychain(client, account, lo, range.lo - 1n);
    await s.save(chainId, account, { lo, hi: range.lo - 1n }, events, Date.now());
  }
}

export async function keysReport(account: Address): Promise<KeysReport> {
  const client = chainClient();
  const chainId = client.chain!.id;
  const key = `${chainId}:${account.toLowerCase()}`;
  let run = inflight.get(key);
  if (!run) {
    run = advance(client, chainId, account).finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  await run;
  const s = (store ??= createPgKeychainStore(db()));
  const [range, events] = await Promise.all([s.range(chainId, account), s.events(chainId, account)]);
  const history = await withAuthorizedLimits(client, foldKeychain(events));
  const keys = await readKeyStates(client, account, history);
  const fromBlock = range?.lo ?? 0n;
  const fromTimeSec = fromBlock > 0n ? await client.getBlock({ blockNumber: fromBlock }).then((b) => b.timestamp).catch(() => null) : null;
  return { keys, coverage: { fromBlock, toBlock: range?.hi ?? 0n, complete: fromBlock === 0n, fromTimeSec } };
}
