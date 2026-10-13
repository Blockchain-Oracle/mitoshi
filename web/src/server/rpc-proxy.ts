import "server-only";
// The browser's own RPC (round 7): the public Moderato RPC answers a phone's reads with 429s, and the terminal sat on
// "Syncing the chain clock…". Reads and raw sends from the page come here; the public RPC stays the page's fallback
// (lib/env.ts). Only JSON-RPC methods a page makes are passed, a batch is capped, and each address gets a token bucket,
// so this is no open relay for anyone else's traffic.
// R6 shell S04: reads never touch the private RPC the ops keepers pace themselves on (TEMPO_RPC_HTTP_URL, Alchemy) — N
// viewers' reads there could get the settler rate-limited. They go to the public RPC under one global cap below its
// per-IP limit (~13 calls/s); past it the page's fallback reads directly with its own budget. A raw send (rare, and it
// must land) still goes through the private RPC.

/** The methods a page sends (viem reads, the wallet's sends); anything else is refused. */
export const RPC_METHODS: ReadonlySet<string> = new Set([
  "eth_chainId", "net_version", "web3_clientVersion", "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_gasPrice",
  "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getLogs",
  "eth_sendRawTransaction", "eth_sendRawTransactionSync",
]);
export const MAX_BATCH = 20;
/** Per address: a burst of 60 calls, refilled at 30 a second. */
const BUCKET = { burst: 60, perSec: 30 } as const;
const buckets = new Map<string, { tokens: number; at: number }>();

/** Every viewer's reads together, below the public RPC's per-IP limit. */
const GLOBAL_READS = { burst: 30, perSec: 10 } as const;
let global = { tokens: GLOBAL_READS.burst as number, at: 0 };
const SENDS: ReadonlySet<string> = new Set(["eth_sendRawTransaction", "eth_sendRawTransactionSync"]);

/** True when the batch carries a raw send (it goes to the private RPC). */
export function carriesSend(body: unknown): boolean {
  return (Array.isArray(body) ? body : [body]).some((c) => typeof c === "object" && c !== null && SENDS.has(String((c as RpcCall).method)));
}

/** Takes `cost` from the shared read budget; false when every viewer together is at the cap. */
export function admitRead(cost: number, now = Date.now()): boolean {
  const tokens = Math.min(GLOBAL_READS.burst, global.tokens + (global.at ? ((now - global.at) / 1000) * GLOBAL_READS.perSec : 0));
  if (tokens < cost) {
    global = { tokens, at: now };
    return false;
  }
  global = { tokens: tokens - cost, at: now };
  return true;
}

export type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

/** Why a body is refused, or null when every call in it may pass. */
export function refusal(body: unknown): string | null {
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) return `a batch of 1–${MAX_BATCH} calls`;
  for (const c of calls) {
    if (typeof c !== "object" || c === null) return "a JSON-RPC call";
    const method = (c as RpcCall).method;
    if (typeof method !== "string" || !RPC_METHODS.has(method)) return `method ${String(method)} is not offered`;
  }
  return null;
}

/** Takes `cost` tokens from this address's bucket; false when it is empty. */
export function admit(key: string, cost: number, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: BUCKET.burst, at: now };
  const tokens = Math.min(BUCKET.burst, b.tokens + ((now - b.at) / 1000) * BUCKET.perSec);
  if (tokens < cost) {
    buckets.set(key, { tokens, at: now });
    return false;
  }
  buckets.set(key, { tokens: tokens - cost, at: now });
  if (buckets.size > 50_000) buckets.clear();
  return true;
}
