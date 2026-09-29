/**
 * AccountKeychain (TIP-1011) history for one account (D-053 trust surface). The precompile can't enumerate keys, so the
 * list is folded from its events — every one indexes `account` first, so one filtered `eth_getLogs` per window collects
 * them all. Moderato caps a query at 100,000 blocks (~14 h); the scanner walks windows with bounded concurrency and the
 * caller persists its cursor (a full history is ~374 windows, 18–25 s once per account; later visits scan only the new
 * blocks).
 */
import { decodeEventLog, pad, toEventSelector, type AbiEvent, type AbiItem, type Address, type Hex, type Log, type PublicClient } from "viem";
import { Abis } from "viem/tempo";
import { TEMPO } from "@cwf/clients";

export const LOG_WINDOW = 100_000n;

const NAMES = ["KeyAuthorized", "AdminKeyAuthorized", "KeyRevoked", "SpendingLimitUpdated", "AccessKeySpend"] as const;
export type KeychainEventName = (typeof NAMES)[number];

const EVENTS = (Abis.accountKeychain as readonly AbiItem[]).filter(
  (i): i is AbiEvent => i.type === "event" && NAMES.includes(i.name as KeychainEventName),
);
export const KEYCHAIN_TOPICS: Hex[] = EVENTS.map((e) => toEventSelector(e));

export interface KeychainEvent {
  name: KeychainEventName;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  keyId: Address;
  token: Address | null;
  /** KeyAuthorized: signature type (0 secp256k1, 1 P-256, 2 WebAuthn). */
  signatureType: number | null;
  /** KeyAuthorized: unix seconds; 0 = never expires. */
  expirySec: bigint | null;
  /** SpendingLimitUpdated: the new limit; AccessKeySpend: what is left. */
  limit: bigint | null;
  amount: bigint | null;
}

export function decodeKeychainLog(log: Pick<Log, "topics" | "data" | "blockNumber" | "logIndex" | "transactionHash">): KeychainEvent | null {
  try {
    const d = decodeEventLog({ abi: Abis.accountKeychain, topics: log.topics as [Hex, ...Hex[]], data: log.data });
    if (!NAMES.includes(d.eventName as KeychainEventName)) return null;
    const a = d.args as Record<string, unknown>;
    return {
      name: d.eventName as KeychainEventName,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      txHash: (log.transactionHash ?? "0x") as Hex,
      keyId: a.publicKey as Address,
      token: (a.token as Address | undefined) ?? null,
      signatureType: a.signatureType === undefined ? null : Number(a.signatureType),
      expirySec: (a.expiry as bigint | undefined) ?? null,
      limit: ((a.newLimit ?? a.remainingLimit) as bigint | undefined) ?? null,
      amount: (a.amount as bigint | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

/** Windows of ≤ `LOG_WINDOW` blocks covering [from, to], newest first. */
export function logWindows(from: bigint, to: bigint, size = LOG_WINDOW): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let hi = to; hi >= from; hi -= size) {
    const lo = hi - size + 1n;
    out.push([lo < from ? from : lo, hi]);
    if (lo <= from) break;
  }
  return out;
}

/** Moderato's public RPC answers bursts with "Request exceeds defined limit": back off and retry a window (4 tries). */
async function withRetry<T>(run: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
}

/** Scans [from, to] for this account's keychain events. Throws if any window fails (the cursor must not skip a gap). */
export async function scanKeychain(client: PublicClient, account: Address, from: bigint, to: bigint, concurrency = 8): Promise<KeychainEvent[]> {
  if (to < from) return [];
  const windows = logWindows(from, to);
  const topic1 = pad(account, { size: 32 });
  const found: KeychainEvent[] = [];
  let next = 0;
  const worker = async () => {
    while (next < windows.length) {
      const [lo, hi] = windows[next++]!;
      const logs = await withRetry(() =>
        client.request({
          method: "eth_getLogs",
          params: [{ address: TEMPO.accountKeychain as Address, fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}`, topics: [KEYCHAIN_TOPICS, topic1] }],
        } as never) as Promise<Log[]>,
      );
      for (const raw of logs) {
        const e = decodeKeychainLog({ ...raw, blockNumber: BigInt(raw.blockNumber as unknown as string), logIndex: Number(raw.logIndex as unknown as string) });
        if (e) found.push(e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, windows.length) }, worker));
  return found.sort((x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1));
}
