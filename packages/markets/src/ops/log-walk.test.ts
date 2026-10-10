/**
 * D-187: a log walk against an RPC that behaves like `rpc.moderato.tempo.xyz` (measured 2026-09-30): a window holding
 * more than 20,000 logs answers `-32602 "query exceeds max results 20000, retry with the range A-B"`, where B is the
 * last block that keeps the window under the cap. The walk goes through viem's real transport and error path.
 */
import { createPublicClient, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { tempoChain } from "../chains";
import { tempoHttp } from "../rpc-http";
import { suggestedLogRange, walkLogWindows } from "./log-walk";

const ADDRESS = "0x113ca86be942671e5290ed57d86297f0ecd61b6a";
const MAX_RESULTS = 20_000;
const hex = (n: bigint | number) => `0x${n.toString(16)}` as Hex;

/** Logs per block: a quiet chain with a busy stretch (the soak's boundaries), 3 logs per block there. */
const density = (b: bigint) => (b >= 40_000n && b < 70_000n ? 3 : b % 10n === 0n ? 1 : 0);
const countIn = (from: bigint, to: bigint) => {
  let n = 0;
  for (let b = from; b <= to; b++) n += density(b);
  return n;
};

function moderatoLogs() {
  const seen = { getLogs: 0, refused: 0 };
  const fetchFn: typeof fetch = async (_url, init) => {
    const req = JSON.parse(String(init!.body)) as { id: number; params: [{ fromBlock: Hex; toBlock: Hex }] };
    seen.getLogs++;
    const from = BigInt(req.params[0].fromBlock);
    const to = BigInt(req.params[0].toBlock);
    if (countIn(from, to) > MAX_RESULTS) {
      seen.refused++;
      let end = from;
      for (let n = 0; n + density(end) <= MAX_RESULTS; end++) n += density(end);
      const error = { code: -32602, message: `query exceeds max results ${MAX_RESULTS}, retry with the range ${from}-${end - 1n}` };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, error }), { headers: { "content-type": "application/json" } });
    }
    const logs = [];
    for (let b = from; b <= to; b++) {
      for (let i = 0; i < density(b); i++) logs.push({ address: ADDRESS, blockHash: hex(b + 1n).padEnd(66, "0"), blockNumber: hex(b), data: "0x", logIndex: hex(i), removed: false, topics: [], transactionHash: hex(b * 10n + BigInt(i)).padEnd(66, "0"), transactionIndex: "0x0" });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: logs }), { headers: { "content-type": "application/json" } });
  };
  return { fetchFn, seen };
}

describe("adaptive eth_getLogs walk (recount, D-187)", () => {
  it("reads viem's error for the RPC's suggested range", async () => {
    const { fetchFn } = moderatoLogs();
    const client = createPublicClient({ chain: tempoChain("testnet"), transport: tempoHttp("https://rpc.example", { fetchFn, retryCount: 0 }) });
    const error = await client.getLogs({ address: ADDRESS, fromBlock: 40_000n, toBlock: 49_999n }).catch((e: unknown) => e);
    expect(suggestedLogRange(error)).toEqual({ from: 40_000n, to: 46_665n });
    expect(suggestedLogRange(new Error("HTTP request failed. Status: 429"))).toBeNull();
  });

  it("covers every block once, in order, honouring the suggested ranges and growing back after", async () => {
    const { fetchFn, seen } = moderatoLogs();
    const client = createPublicClient({ chain: tempoChain("testnet"), transport: tempoHttp("https://rpc.example", { fetchFn, retryCount: 0 }) });
    const ranges: Array<[bigint, bigint]> = [];
    let logs = 0;
    const stats = await walkLogWindows(0n, 199_999n, async (from, to) => {
      logs += (await client.getLogs({ address: ADDRESS, fromBlock: from, toBlock: to })).length;
      ranges.push([from, to]);
    });
    expect(logs).toBe(countIn(0n, 199_999n));
    expect(ranges[0]![0]).toBe(0n);
    expect(ranges.at(-1)![1]).toBe(199_999n);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]![0]).toBe(ranges[i - 1]![1] + 1n);
    // The busy stretch (90,000 logs) needs ≥ 5 windows of ≤ 20,000; each refusal costs one request, never a halving spiral.
    expect(stats.refused).toBe(seen.refused);
    expect(stats.refused).toBeLessThanOrEqual(ranges.filter(([f, t]) => countIn(f, t) > 10_000).length + 1);
    // Past the busy stretch the window doubles back up (6,666 → … ≥ 50,000 blocks).
    expect(Math.max(...ranges.filter(([f]) => f >= 70_000n).map(([f, t]) => Number(t - f + 1n)))).toBeGreaterThanOrEqual(50_000);
  });

  it("keeps under a window an un-hinted refusal set, instead of being refused once per window (F-S5-02)", async () => {
    // Moderato aborts a body over its size limit with no range to retry: here, any window over 12,000 blocks.
    const sizes: bigint[] = [];
    let refused = 0;
    const stats = await walkLogWindows(0n, 399_999n, async (from, to) => {
      sizes.push(to - from + 1n);
      if (to - from + 1n > 12_000n) {
        refused++;
        throw new Error("HTTP response body exceeded the size limit.");
      }
    });
    expect(refused).toBe(stats.refused);
    // 50,000 → 25,000 → 12,500 refused, then ≤ 9,375 (¾ of the ceiling). Every 16 answers the ceiling relaxes, which
    // costs at most two refusals before it settles again — against one refusal per two windows without a ceiling.
    const answered = sizes.filter((n) => n <= 12_000n);
    expect(answered.reduce((a, n) => a + n, 0n)).toBe(400_000n);
    expect(stats.refused).toBeLessThanOrEqual(3 + 2 * Math.ceil(answered.length / 16));
    expect(stats.refused * 4).toBeLessThan(answered.length);
  });

  it("shrinks a tail clipped at the range's end on every refusal, never retrying the same window", async () => {
    // A 100,000-block window over an 11,000-block range is clipped to 11,000: its refusal must halve 11,000, not 100,000.
    const tried: bigint[] = [];
    await walkLogWindows(0n, 10_999n, async (from, to) => {
      tried.push(to - from + 1n);
      if (to - from + 1n > 4_000n) throw new Error("HTTP response body exceeded the size limit.");
    }, { initialBlocks: 100_000n });
    expect(tried.slice(0, 3)).toEqual([11_000n, 5_500n, 2_750n]);
  });

  it("halves on an error without a hint, and gives up only at the minimum window", async () => {
    let calls = 0;
    const seen: bigint[] = [];
    await expect(
      walkLogWindows(0n, 999n, async (from, to) => {
        calls++;
        seen.push(to - from + 1n);
        throw new Error("upstream timeout");
      }, { initialBlocks: 800n, minBlocks: 100n }),
    ).rejects.toThrow("upstream timeout");
    expect(seen).toEqual([800n, 400n, 200n, 100n]);
    expect(calls).toBe(4);
  });
});
