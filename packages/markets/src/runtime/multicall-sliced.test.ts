import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, multicall3Abi, type Abi, type AbiParameter, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { tempoReadChain } from "../read-chain";
import { multicallSliced } from "./multicall-sliced";

const LENS = "0x00000000000000000000000000000000000000a1" as const;
const ids = Array.from({ length: 40 }, (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex);

/** A deterministic value of an ABI type (every field distinct per Window and per field). */
function sample(p: AbiParameter, seed: number): unknown {
  const t = p.type;
  if (t === "tuple") return Object.fromEntries((p as unknown as { components: AbiParameter[] }).components.map((c, i) => [c.name!, sample(c, seed * 31 + i + 1)]));
  if (t.endsWith("[]")) return [sample({ ...p, type: t.slice(0, -2) } as AbiParameter, seed), sample({ ...p, type: t.slice(0, -2) } as AbiParameter, seed + 1)];
  if (t === "bool") return seed % 2 === 0;
  if (t === "address") return `0x${(seed % 0xffff).toString(16).padStart(40, "0")}`;
  if (t.startsWith("bytes")) return `0x${(seed % 0xffffff).toString(16).padStart(Number(t.slice(5) || 32) * 2, "0")}`;
  const bits = Number(t.replace(/^u?int/, "") || 256);
  const span = 2 ** Math.min(bits - 1, 15);
  if (t.startsWith("int")) return BigInt((seed % span) - Math.floor(span / 2));
  if (t.startsWith("uint")) return BigInt(seed % span);
  throw new Error(`no sample for ${t}`);
}

/** A fake RPC answering Multicall3 `aggregate3` over the lens: `marketOf`/`marketRef` per id, the 7th id reverts. */
function fakeRpc() {
  let requests = 0;
  const request = async ({ method, params }: { method: string; params: unknown[] }) => {
    if (method !== "eth_call") throw new Error(`unexpected ${method}`);
    requests += 1;
    const { data } = params[0] as { data: Hex };
    const { args } = decodeFunctionData({ abi: multicall3Abi, data });
    const calls = args[0] as readonly { callData: Hex }[];
    const out = calls.map(({ callData }) => {
      const call = decodeFunctionData({ abi: engineLensAbi as Abi, data: callData });
      const idx = ids.indexOf((call.args as Hex[])[0]!);
      if (idx === 6) return { success: false, returnData: "0x" as Hex };
      const fn = (engineLensAbi as Abi).find((x) => x.type === "function" && x.name === call.functionName) as unknown as { outputs: AbiParameter[] };
      const values = fn.outputs.map((o, i) => sample(o, idx * 100 + i + (call.functionName === "marketRef" ? 7 : 3)));
      return { success: true, returnData: encodeFunctionResult({ abi: engineLensAbi as Abi, functionName: call.functionName, result: values.length === 1 ? values[0] : values } as never) };
    });
    return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: out });
  };
  return { request, count: () => requests };
}

describe("multicallSliced (D-184)", () => {
  it("answers exactly as viem's multicall: the same statuses and decoded results per call", async () => {
    const rpc = fakeRpc();
    const client = createPublicClient({ chain: tempoReadChain("testnet"), transport: custom({ request: rpc.request as never }), batch: { multicall: { wait: 0, batchSize: 8_192 } } });
    const contracts = ids.flatMap((id) => [
      { address: LENS, abi: engineLensAbi as Abi, functionName: "marketOf", args: [id] },
      { address: LENS, abi: engineLensAbi as Abi, functionName: "marketRef", args: [id] },
    ]);
    const viemResults = (await client.multicall({ contracts: contracts as never, allowFailure: true })) as unknown as { status: string; result?: unknown }[];
    const sliced = await multicallSliced(client, contracts, { sliceMs: 0 });
    expect(sliced.map((r) => r.status)).toEqual(viemResults.map((r) => r.status));
    expect(sliced.filter((r) => r.status === "failure")).toHaveLength(2);
    sliced.forEach((r, i) => {
      if (r.status === "success") expect(r.result).toEqual(viemResults[i]!.result);
    });
  });

  it("chunks by calldata bytes like viem and keeps call order across chunks", async () => {
    const rpc = fakeRpc();
    const client = createPublicClient({ chain: tempoReadChain("testnet"), transport: custom({ request: rpc.request as never }) });
    const contracts = ids.map((id) => ({ address: LENS, abi: engineLensAbi as Abi, functionName: "marketRef", args: [id] }));
    const whole = await multicallSliced(client, contracts);
    const before = rpc.count();
    const chunked = await multicallSliced(client, contracts, { chunkBytes: 36 * 7 });
    expect(rpc.count() - before).toBe(Math.ceil(ids.length / 7));
    expect(chunked).toEqual(whole);
  });
});
