import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, multicall3Abi, type Abi, type Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import type { MarketId } from "@cwf/core";
import { tempoReadChain } from "../read-chain";

// A fake RPC for the lens's `levels` walk: each Window's book differs by id and side; every eth_call is counted.
let requests = 0;
async function request({ method, params }: { method: string; params: unknown[] }) {
  if (method !== "eth_call") throw new Error(`unexpected ${method}`);
  requests += 1;
  const calls = decodeFunctionData({ abi: multicall3Abi, data: (params[0] as { data: Hex }).data }).args[0] as readonly { callData: Hex }[];
  const out = calls.map(({ callData }) => {
    const { args } = decodeFunctionData({ abi: engineLensAbi as Abi, data: callData });
    const [market, isBid, n] = args as [Hex, boolean, bigint];
    const seed = Number(BigInt(market) % 97n);
    const ticks = Array.from({ length: Number(n) }, (_, i) => (isBid ? 500 - seed - i : 501 + seed + i));
    const lots = ticks.map((_, i) => (i % 3 === 2 ? 0n : BigInt(1_000 * (seed + i + 1))));
    return { success: true, returnData: encodeFunctionResult({ abi: engineLensAbi as Abi, functionName: "levels", result: [ticks, lots] } as never) };
  });
  return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: out });
}
const client = createPublicClient({ chain: tempoReadChain("testnet"), transport: custom({ request: request as never }), batch: { multicall: { wait: 8, batchSize: 8_192 } } });
vi.mock("../runtime/read-runtime", async (orig) => ({ ...(await orig<typeof import("../runtime/read-runtime")>()), getPublicClient: async () => client }));
const { readBook, readBookBatched } = await import("./lens");

const ids = Array.from({ length: 12 }, (_, i) => `0x${(0xa0 + i).toString(16).padStart(64, "0")}` as MarketId);

describe("readBookBatched (D-184)", () => {
  beforeEach(() => {
    requests = 0;
  });

  it("reads each Window's book exactly as readBook does", async () => {
    const own = await Promise.all(ids.map((id) => readBook(id, 30, 10)));
    const batched = await Promise.all(ids.map((id) => readBookBatched(id, 30, 10)));
    expect(batched).toEqual(own);
    expect(batched[0]!.bids.length).toBeGreaterThan(0);
  });

  it("asks once for every book asked in the same pass", async () => {
    await Promise.all(ids.map((id) => readBookBatched(id, 30, 10)));
    expect(requests).toBe(1);
  });
});
