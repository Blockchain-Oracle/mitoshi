/**
 * Re-verify a print in this browser (S5 gate: "a proof reverified"), from the chain alone: read the record
 * transaction, take `recordPrint(market, which, proof)`'s signed RedStone packages out of its call to the engine, and
 * `eth_call` the verifier's `verifyPrint(proof, query)` — the engine's own check, run again. Only the feed, the
 * boundary and the strict window matter to the RedStone verifier, so the rest of the query is zero; long after the
 * boundary its threshold applies. Checked against Moderato with `cast call` (close of 0x78cc…e895: 33,637,199,250 from
 * 5 signers, the recorded print). viem loads here, on demand, not with the page.
 */
export interface ReverifyInput {
  rpcUrl: string;
  txHash: `0x${string}`;
  market: `0x${string}`;
  which: number;
  feed: string;
  t: number;
  verifier: `0x${string}`;
}

export interface ReverifyResult {
  priceE8: bigint;
  signers: number;
}

const RECORD = "function recordPrint(bytes32 m, uint8 which, bytes proof)";
const VERIFY = "function verifyPrint(bytes proof, (bytes32 marketId, uint8 which, uint40 t, bytes32 feedId, uint32 strictSec, uint16 graceSec, uint16 minDelaySec, uint16 barLenSec, uint16 maxConfBps, uint8 statusMask) q) view returns (int256 price, int8 expo, uint40 sourceTs, uint8 count)";

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) throw new Error(body.error?.message ?? `${method} answered nothing`);
  return body.result;
}

export async function reverifyPrint(i: ReverifyInput): Promise<ReverifyResult> {
  const { decodeFunctionData, decodeFunctionResult, encodeFunctionData, parseAbi, stringToHex } = await import("viem");
  const abi = parseAbi([RECORD, VERIFY]);
  type Call = { to?: string; input?: `0x${string}`; data?: `0x${string}` };
  const tx = await rpc<{ calls?: Call[]; input?: `0x${string}`; to?: string }>(i.rpcUrl, "eth_getTransactionByHash", [i.txHash]);
  const calls: Call[] = tx.calls?.length ? tx.calls : [{ to: tx.to, input: tx.input }];
  let proof: `0x${string}` | null = null;
  for (const c of calls) {
    const data = c.input ?? c.data;
    if (!data || data.length < 10) continue;
    try {
      const d = decodeFunctionData({ abi, data });
      if (d.functionName !== "recordPrint") continue;
      const [m, which, p] = d.args as readonly [`0x${string}`, number, `0x${string}`];
      if (m.toLowerCase() === i.market.toLowerCase() && Number(which) === i.which) proof = p;
    } catch {
      // another call in the same transaction
    }
  }
  if (!proof) throw new Error("this transaction carries no recordPrint for this print");
  const query = { marketId: i.market, which: i.which, t: i.t, feedId: stringToHex(i.feed, { size: 32 }), strictSec: 0, graceSec: 0, minDelaySec: 0, barLenSec: 0, maxConfBps: 0, statusMask: 0 };
  const data = encodeFunctionData({ abi, functionName: "verifyPrint", args: [proof, query] });
  const out = await rpc<`0x${string}`>(i.rpcUrl, "eth_call", [{ to: i.verifier, data }, "latest"]);
  const [price, , , count] = decodeFunctionResult({ abi, functionName: "verifyPrint", data: out }) as readonly [bigint, number, number, number];
  return { priceE8: price, signers: Number(count) };
}
