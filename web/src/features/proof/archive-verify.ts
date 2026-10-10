/**
 * Re-verify a print from the archive (S5 gate, G-10: "replays the RedStone packages behind a print, verified against the
 * same on-chain rule"): the packages ops archived for the print's instant (`/api/index/archive/<feed>`, RedStone's own
 * gateway JSON, kept apart from the record transaction), built into the verifier's payload (`@cwf/core`'s pure
 * builder) and `eth_call`ed on the same `verifyPrint` the engine called. For a Window that got no print it answers why:
 * the verifier's own error (e.g. too few signers at that instant). Runs in the browser; viem loads on the press.
 */
import { packagesAt, redstonePayload, toHex, type RedStonePackage } from "@cwf/core/prices/redstone";

export interface ArchiveInput {
  rpcUrl: string;
  market: `0x${string}`;
  which: number;
  feed: string;
  t: number;
  verifier: `0x${string}`;
}

export type ArchiveResult =
  | { kind: "verified"; priceE8: bigint; signers: number; archived: number }
  | { kind: "refused"; reason: string; archived: number }
  | { kind: "missing" };

const VERIFY = "function verifyPrint(bytes proof, (bytes32 marketId, uint8 which, uint40 t, bytes32 feedId, uint32 strictSec, uint16 graceSec, uint16 minDelaySec, uint16 barLenSec, uint16 maxConfBps, uint8 statusMask) q) view returns (int256 price, int8 expo, uint40 sourceTs, uint8 count)";
/** The verifier's refusals (`RedStonePrintVerifier.sol`, `E`), by name. */
const ERRORS = ["InsufficientRedStoneSigners", "RedStoneTimestampMismatch", "FeedIdMismatch", "UnknownRedStoneSigner", "DuplicateRedStoneSigner", "InvalidPrintValue", "SpotTooOld"] as const;

export async function archiveReverify(i: ArchiveInput): Promise<ArchiveResult> {
  const res = await fetch(`/api/index/archive/${encodeURIComponent(i.feed)}?from=${i.t}&to=${i.t}`);
  if (!res.ok) throw new Error(`archive answered ${res.status}`);
  const body = (await res.json()) as { rows?: { t_sec: string; packages: RedStonePackage[] | null }[] };
  const row = (body.rows ?? []).find((r) => Number(r.t_sec) === i.t);
  const packages = row?.packages ? packagesAt({ [i.feed]: row.packages.map((p) => ({ ...p, dataPoints: p.dataPoints.map((d) => ({ ...d, value: String(d.value) })) })) }, i.feed, i.t * 1000) : [];
  if (packages.length === 0) return { kind: "missing" };
  const { decodeFunctionResult, encodeFunctionData, parseAbi, stringToHex, toFunctionSelector } = await import("viem");
  const abi = parseAbi([VERIFY]);
  const query = { marketId: i.market, which: i.which, t: i.t, feedId: stringToHex(i.feed, { size: 32 }), strictSec: 0, graceSec: 0, minDelaySec: 0, barLenSec: 0, maxConfBps: 0, statusMask: 0 };
  const data = encodeFunctionData({ abi, functionName: "verifyPrint", args: [toHex(redstonePayload(packages, i.feed)), query] });
  const answer = await fetch(i.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: i.verifier, data }, "latest"] }) });
  const out = (await answer.json()) as { result?: `0x${string}`; error?: { message?: string; data?: string } };
  if (out.result && out.result !== "0x") {
    const [price, , , count] = decodeFunctionResult({ abi, functionName: "verifyPrint", data: out.result }) as readonly [bigint, number, number, number];
    return { kind: "verified", priceE8: price, signers: Number(count), archived: packages.length };
  }
  const selector = typeof out.error?.data === "string" ? out.error.data.slice(0, 10).toLowerCase() : null;
  const named = ERRORS.find((e) => toFunctionSelector(`${e}()`).toLowerCase() === selector);
  return { kind: "refused", reason: named ?? out.error?.message ?? "reverted", archived: packages.length };
}
