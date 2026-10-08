/**
 * Multicall3 `aggregate3` whose per-call decode is spread over tasks (D-184). viem's `multicall` decodes every call's
 * result in one loop after the last response: for the lane list (~50–70 Windows × two lens reads, ~230 KB) that loop is
 * one 60 ms task on a cold page — 240 ms at the lab's 4× CPU, the longest task left on /markets. This sends the same
 * `aggregate3` request(s) (chunked by calldata bytes as viem chunks), returns viem's `allowFailure: true` shape per
 * call, and decodes in slices that give the main thread back every few milliseconds.
 */
import { decodeFunctionResult, encodeFunctionData, multicall3Abi, type Abi, type Address, type Hex } from "viem";
import { MULTICALL_CHUNK_BYTES } from "../rpc-http";

export interface SlicedCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export type SlicedResult = { status: "success"; result: unknown; error?: undefined } | { status: "failure"; result?: undefined; error: Error };

/** The two things this needs from a viem client: its Multicall3 address and a raw request. */
export interface SlicedClient {
  chain?: { contracts?: { multicall3?: { address: Address } } } | undefined;
  request: (args: { method: "eth_call"; params: [{ to: Address; data: Hex }, "latest"] }) => Promise<unknown>;
}

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

/** Gives the main thread back (Chrome's `scheduler.yield`, else a macrotask). */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function multicallSliced(client: SlicedClient, calls: readonly SlicedCall[], options: { chunkBytes?: number; sliceMs?: number } = {}): Promise<SlicedResult[]> {
  if (calls.length === 0) return [];
  const multicall3 = client.chain?.contracts?.multicall3?.address;
  if (!multicall3) throw new Error("multicallSliced: the client's chain has no multicall3 address");
  const { chunkBytes = MULTICALL_CHUNK_BYTES, sliceMs = 5 } = options;

  const chunks: { target: Address; allowFailure: true; callData: Hex }[][] = [[]];
  let size = 0;
  for (const call of calls) {
    const callData = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args } as Parameters<typeof encodeFunctionData>[0]);
    const bytes = (callData.length - 2) / 2;
    if (size + bytes > chunkBytes && chunks.at(-1)!.length > 0) {
      chunks.push([]);
      size = 0;
    }
    size += bytes;
    chunks.at(-1)!.push({ target: call.address, allowFailure: true, callData });
  }

  const answers = await Promise.all(
    chunks.map(async (chunk) => {
      const data = encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [chunk] });
      const out = (await client.request({ method: "eth_call", params: [{ to: multicall3, data }, "latest"] })) as Hex;
      return decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: out });
    }),
  );

  const raw = answers.flat();
  const results: SlicedResult[] = [];
  let sliceStart = now();
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;
    const answer = raw[i];
    if (!answer || !answer.success) {
      results.push({ status: "failure", error: new Error(`${call.functionName} reverted`) });
    } else {
      try {
        results.push({ status: "success", result: decodeFunctionResult({ abi: call.abi, functionName: call.functionName, args: call.args, data: answer.returnData } as Parameters<typeof decodeFunctionResult>[0]) });
      } catch (error) {
        results.push({ status: "failure", error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    if (now() - sliceStart >= sliceMs && i < calls.length - 1) {
      await yieldToMain();
      sliceStart = now();
    }
  }
  return results;
}
