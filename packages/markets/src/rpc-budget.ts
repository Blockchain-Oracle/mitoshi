/**
 * A process-wide request budget for one Tempo RPC URL (D-134). Measured on `rpc.moderato.tempo.xyz` (2026-09-29): the
 * public endpoint rate-limits per client IP by method weight — ≈ 36 `eth_blockNumber`/s or ≈ 13 `eth_call`/s sustained
 * (weight 1 vs 3), answering HTTP 429 / -32005 "rate limited, try again in N ms" beyond it. Every ops actor shares the
 * container's IP, so without pacing the actors burst past it at each boundary and burn their retries. The budget paces
 * requests through a token bucket instead: the print path's actors (relay, roller, settler) before the house's quotes and
 * trades before bookkeeping (indexer, watchers); within a tier sends first, reads next, log scans last; a 429 pauses
 * the bucket for the time the RPC asked.
 */

/** Weight per method, as the RPC counts it (measured: eth_call 3, eth_getBlockByNumber / eth_getTransactionCount 2,
 * eth_blockNumber 1). Unmeasured methods count 2; the send path counts 3. */
export const METHOD_WEIGHT: Readonly<Record<string, number>> = {
  eth_blockNumber: 1,
  eth_chainId: 1,
  eth_call: 3,
  eth_estimateGas: 3,
  eth_getLogs: 3,
  eth_fillTransaction: 3,
  eth_sendRawTransaction: 3,
  eth_sendRawTransactionSync: 3,
  eth_getBlockByNumber: 2,
  eth_getTransactionCount: 2,
  eth_getTransactionReceipt: 2,
};
const DEFAULT_WEIGHT = 2;

export type Priority = 0 | 1 | 2;
/** 0 = the send path, 1 = reads, 2 = log scans. */
export function priorityOf(method: string): Priority {
  if (method === "eth_getLogs") return 2;
  if (/^eth_(sendRawTransaction|fillTransaction|estimateGas|getTransactionCount|getTransactionReceipt)/.test(method)) return 0;
  return 1;
}
export const weightOf = (method: string) => METHOD_WEIGHT[method] ?? DEFAULT_WEIGHT;

export interface RpcBudgetStats {
  unitsPerSec: number;
  /** Units and requests granted over the last full minute, per method. */
  lastMinute: { units: number; requests: Record<string, number> };
  queued: number;
  maxWaitMs: number;
  limited: number;
}

type Waiter = { weight: number; priority: number; resolve: () => void; since: number };

/** Who is asking: the print path (relay, roller, settler) before the house's quotes and trades, before bookkeeping. */
export type RpcTier = 0 | 1 | 2;

export class RpcBudget {
  private tokens: number;
  private lastMs: number;
  private pausedUntilMs = 0;
  private readonly queue: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private minute = { startMs: 0, units: 0, requests: {} as Record<string, number> };
  private last = { units: 0, requests: {} as Record<string, number> };
  private maxWaitMs = 0;
  private limited = 0;

  constructor(
    readonly unitsPerSec: number,
    /** Bucket size: how much may go at once after an idle spell. */
    readonly burst = unitsPerSec,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.lastMs = now();
    this.minute.startMs = this.lastMs;
  }

  /** Resolves when `method` may be sent; a lower tier goes first, then the send path within a tier. */
  acquire(method: string, tier: RpcTier = 1): Promise<void> {
    const weight = Math.min(weightOf(method), this.burst);
    this.count(method, weight);
    return new Promise((resolve) => {
      this.queue.push({ weight, priority: tier * 10 + priorityOf(method), resolve, since: this.now() });
      this.queue.sort((a, b) => a.priority - b.priority || a.since - b.since);
      this.drain();
    });
  }

  /** The RPC answered "rate limited, try again in N ms": nothing goes until then. */
  backOff(ms: number): void {
    this.limited++;
    this.pausedUntilMs = Math.max(this.pausedUntilMs, this.now() + ms);
    this.tokens = Math.min(this.tokens, 0);
    this.drain();
  }

  stats(): RpcBudgetStats {
    this.rollMinute();
    return { unitsPerSec: this.unitsPerSec, lastMinute: this.last, queued: this.queue.length, maxWaitMs: this.maxWaitMs, limited: this.limited };
  }

  private count(method: string, weight: number) {
    this.rollMinute();
    this.minute.units += weight;
    this.minute.requests[method] = (this.minute.requests[method] ?? 0) + 1;
  }

  private rollMinute() {
    const t = this.now();
    if (t - this.minute.startMs < 60_000) return;
    this.last = { units: this.minute.units, requests: this.minute.requests };
    this.minute = { startMs: t, units: 0, requests: {} };
  }

  private drain() {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.lastMs) / 1000) * this.unitsPerSec);
    this.lastMs = t;
    while (this.queue.length && t >= this.pausedUntilMs && this.tokens >= this.queue[0]!.weight) {
      const w = this.queue.shift()!;
      this.tokens -= w.weight;
      this.maxWaitMs = Math.max(this.maxWaitMs, t - w.since);
      w.resolve();
    }
    if (!this.queue.length || this.timer) return;
    const needMs = Math.max(this.pausedUntilMs - t, ((this.queue[0]!.weight - this.tokens) / this.unitsPerSec) * 1000, 1);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, Math.ceil(needMs));
  }
}

const budgets = new Map<string, RpcBudget>();
/** One budget per RPC URL per process (every ops client of a URL shares the IP's limit). */
export function sharedRpcBudget(url: string, unitsPerSec: number): RpcBudget {
  let b = budgets.get(url);
  if (!b) budgets.set(url, (b = new RpcBudget(unitsPerSec)));
  return b;
}
export const rpcBudgetStats = (): Record<string, RpcBudgetStats> => Object.fromEntries([...budgets].map(([url, b]) => [new URL(url).host, b.stats()]));

/** "rate limited, try again in 273ms" → 273; anything else → null. */
export function retryHintMs(text: string): number | null {
  const m = /-32005[\s\S]*?try again in (\d+)\s*ms/.exec(text) ?? /try again in (\d+)\s*ms/.exec(text);
  return m ? Number(m[1]) : null;
}

/** `fetch` that waits for the budget before each JSON-RPC request and pauses it on a rate-limit answer. */
export function budgetedFetch(budget: RpcBudget, fetchFn: typeof fetch = fetch, tier: RpcTier = 1): typeof fetch {
  return async (input, init) => {
    let method = "unknown";
    try {
      method = (JSON.parse(String(init?.body)) as { method?: string }).method ?? method;
    } catch {
      /* not JSON-RPC */
    }
    await budget.acquire(method, tier);
    const response = await fetchFn(input, init);
    if (response.status === 429) budget.backOff(retryHintMs(await response.clone().text()) ?? 250);
    return response;
  };
}
