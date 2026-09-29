/**
 * D-130/D-131: the ops client against an RPC that behaves like `rpc.moderato.tempo.xyz` (measured 2026-09-29): a
 * JSON-RPC batch over its weight budget (9 `eth_call`s) answers HTTP 413 with ONE error object, and a rate-limited
 * request answers HTTP 429 with a -32005 error object. viem's batched transport cannot survive that shape; the ops
 * transport sends one request per HTTP request and retries the rate limit, and `fetchMarkets` never turns a failed
 * read into "no such Window".
 */
import { decodeFunctionData, encodeErrorResult, encodeFunctionResult, http, createPublicClient, multicall3Abi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { createOpsClient, fetchMarkets, marketIdOf, venueOf } from "./ops";
import { tempoChain } from "./chains";

type Rpc = { id: number; method: string; params: unknown[] };
const WEIGHT: Record<string, number> = { eth_call: 3, eth_blockNumber: 1, eth_chainId: 1 };
const BUDGET = 24;

/** The public RPC's observable behaviour: a weight-budgeted batch cap and a leaky rate limit, both answered whole. */
function moderatoLike(opts: { rateLimitFirst?: number; answerCall?: (data: Hex) => Hex } = {}) {
  const seen = { http: 0, batches: 0, limited: 0 };
  let limitLeft = opts.rateLimitFirst ?? 0;
  const one = (r: Rpc) => {
    if (r.method === "eth_chainId") return { jsonrpc: "2.0", id: r.id, result: "0xa5bf" };
    if (r.method === "eth_blockNumber") return { jsonrpc: "2.0", id: r.id, result: "0x10" };
    if (r.method === "eth_call") return { jsonrpc: "2.0", id: r.id, result: opts.answerCall?.((r.params[0] as { data: Hex }).data) ?? "0x" };
    return { jsonrpc: "2.0", id: r.id, error: { code: -32601, message: "method not found" } };
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchFn: typeof fetch = async (_url, init) => {
    seen.http++;
    const body = JSON.parse(String(init?.body)) as Rpc | Rpc[];
    const list = Array.isArray(body) ? body : [body];
    if (Array.isArray(body)) seen.batches++;
    if (list.reduce((w, r) => w + (WEIGHT[r.method] ?? 2), 0) > BUDGET) return json(413, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "request too large" } });
    if (limitLeft > 0) {
      limitLeft--;
      seen.limited++;
      return json(429, { jsonrpc: "2.0", id: null, error: { code: -32005, message: "rate limited, try again in 100ms" } });
    }
    return json(200, Array.isArray(body) ? list.map(one) : one(body));
  };
  return { fetchFn, seen };
}

describe("the ops transport against the public RPC's limits", () => {
  it("viem's default batching fails every request of an over-budget batch (the soak's failure)", async () => {
    const rpc = moderatoLike();
    const client = createPublicClient({ chain: tempoChain("testnet"), transport: http("https://rpc.test", { batch: { wait: 10 }, retryCount: 0, fetchFn: rpc.fetchFn }) });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => client.call({ to: "0x0000000000000000000000000000000000000001", data: "0x00" })));
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(rpc.seen.batches).toBeGreaterThan(0);
  });

  it("sends each request on its own and all of a boundary's concurrent reads succeed", async () => {
    const rpc = moderatoLike();
    const client = createOpsClient({ network: "testnet", rpcUrl: "https://rpc.test", fetchFn: rpc.fetchFn, unitsPerSec: 0 });
    const call = () => client.public.request({ method: "eth_call", params: [{ to: "0x0000000000000000000000000000000000000001", data: "0x00" }, "latest"] });
    const results = await Promise.all(Array.from({ length: 40 }, call));
    expect(results).toHaveLength(40);
    expect(rpc.seen.batches).toBe(0);
    expect(rpc.seen.http).toBe(40);
  });

  it("retries a rate-limited request with backoff instead of failing it", async () => {
    const rpc = moderatoLike({ rateLimitFirst: 3 });
    const client = createOpsClient({ network: "testnet", rpcUrl: "https://rpc.test", fetchFn: rpc.fetchFn, unitsPerSec: 0 });
    await expect(client.public.getBlockNumber({ cacheTime: 0 })).resolves.toBe(16n);
    expect(rpc.seen.limited).toBe(3);
  });
});

describe("fetchMarkets (D-131)", () => {
  const venue = venueOf(42431)!;
  const ids = [marketIdOf("0x" + "11".repeat(32) as Hex, 0n), marketIdOf("0x" + "11".repeat(32) as Hex, 1n)];
  /** Answers Multicall3 `aggregate3` with every call reverting `UnknownMarket`, as the lens does for an unknown id. */
  const unknownEverywhere = (data: Hex): Hex => {
    const { args } = decodeFunctionData({ abi: multicall3Abi, data });
    const calls = args[0] as readonly unknown[];
    const revert = encodeErrorResult({ abi: engineLensAbi, errorName: "UnknownMarket" });
    return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: calls.map(() => ({ success: false, returnData: revert })) });
  };

  it("reads an unknown Window as null", async () => {
    const rpc = moderatoLike({ answerCall: unknownEverywhere });
    const client = createOpsClient({ network: "testnet", rpcUrl: "https://rpc.test", fetchFn: rpc.fetchFn, unitsPerSec: 0 });
    await expect(fetchMarkets(client, venue, ids)).resolves.toEqual([null, null]);
  });

  it("throws when the read itself failed, so the relay never skips a Window it could not read", async () => {
    const rpc = moderatoLike({ rateLimitFirst: 1_000, answerCall: unknownEverywhere });
    const client = createOpsClient({ network: "testnet", rpcUrl: "https://rpc.test", fetchFn: rpc.fetchFn, unitsPerSec: 0 });
    await expect(fetchMarkets(client, venue, ids)).rejects.toThrow(/not read/);
  }, 20_000);
});
