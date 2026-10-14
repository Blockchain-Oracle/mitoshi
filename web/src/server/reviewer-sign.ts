import "server-only";
/** The shared review wallet can touch only Mitoshi's deployed testnet contracts. */
import { TEMPO } from "@cwf/clients";
import { AREAS, deploymentOf, sendBatch, tempoChain, type NoncePlan } from "@cwf/markets";
import { createWalletClient, decodeFunctionData, getAddress, http, isAddress, maxUint256, type Hex } from "viem";
import { ceremonyLimiter } from "./auth";
import { serverEnv } from "./env";
import { reviewerAccount, reviewerSession } from "./reviewer";

const MAX_CALLS = 4;
const MAX_DATA_BYTES = 10_000;
const MAX_APPROVAL_BASE = 25_000_000n; // $25 pathUSD, six decimals
const APPROVE = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const noStore = { "cache-control": "no-store" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: noStore });

function allowedTargets(chainId: number): Set<string> {
  const addresses = new Set<string>();
  for (const area of AREAS) for (const contract of Object.values(deploymentOf(area, chainId) ?? {})) addresses.add(contract.address.toLowerCase());
  return addresses;
}

type WireCall = { to?: unknown; data?: unknown; value?: unknown };
type WireTx = { from?: unknown; to?: unknown; data?: unknown; value?: unknown; calls?: unknown; feeToken?: unknown; feePayer?: unknown; nonceKey?: unknown; validBefore?: unknown };

function amount(value: unknown): bigint | null {
  try { return typeof value === "bigint" || typeof value === "number" || typeof value === "string" ? BigInt(value) : null; } catch { return null; }
}

function transaction(input: unknown, address: string, chainId: number) {
  if (!input || typeof input !== "object") return null;
  const tx = input as WireTx;
  if (typeof tx.from !== "string" || tx.from.toLowerCase() !== address.toLowerCase()) return null;
  if (tx.value !== undefined && amount(tx.value) !== 0n) return null;
  if (tx.feeToken !== undefined && (typeof tx.feeToken !== "string" || tx.feeToken.toLowerCase() !== TEMPO.pathUSD.toLowerCase())) return null;
  const rawCalls = Array.isArray(tx.calls) ? tx.calls : tx.to ? [{ to: tx.to, data: tx.data, value: tx.value }] : null;
  if (!rawCalls || rawCalls.length < 1 || rawCalls.length > MAX_CALLS) return null;
  const targets = allowedTargets(chainId);
  if (targets.size === 0) return null;
  const calls: Array<{ to: `0x${string}`; data: Hex }> = [];
  for (const raw of rawCalls as WireCall[]) {
    if (!raw || typeof raw.to !== "string" || !isAddress(raw.to) || typeof raw.data !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(raw.data) || (raw.data.length - 2) / 2 > MAX_DATA_BYTES || (raw.value !== undefined && amount(raw.value) !== 0n)) return null;
    const to = getAddress(raw.to);
    const data = raw.data as Hex;
    if (to.toLowerCase() === TEMPO.pathUSD.toLowerCase()) {
      try {
        const decoded = decodeFunctionData({ abi: APPROVE, data });
        if (decoded.functionName !== "approve" || !targets.has(decoded.args[0].toLowerCase()) || decoded.args[1] > MAX_APPROVAL_BASE) return null;
      } catch { return null; }
    } else if (!targets.has(to.toLowerCase())) return null;
    calls.push({ to, data });
  }
  const key = tx.nonceKey === undefined ? undefined : amount(tx.nonceKey);
  const expiry = tx.validBefore === undefined ? undefined : Number(amount(tx.validBefore));
  const now = Math.floor(Date.now() / 1000);
  if (key === null || (expiry !== undefined && (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 300))) return null;
  if (key === undefined && expiry !== undefined) return null;
  if (key === maxUint256 && expiry === undefined) return null;
  const nonce: NoncePlan = key === undefined ? { kind: "protocol" } : key === maxUint256 ? { kind: "expiring", validForSec: expiry! - now } : { kind: "lane", key };
  return { calls, nonce, nowSec: now };
}

export async function signReviewerRequest(req: Request): Promise<Response> {
  const address = await reviewerSession(req);
  if (!address) return fail(401, "no_review_session");
  const env = serverEnv();
  if (env.network !== "testnet") return fail(403, "testnet_only");
  if (req.headers.get("origin") !== env.appOrigin) return fail(403, "bad_origin");
  const input = (await req.json().catch(() => null)) as { method?: unknown; params?: unknown } | null;
  if (!input || !["eth_sendTransaction", "wallet_sendTransaction"].includes(String(input.method))) return fail(400, "unsupported_method");
  if (!Array.isArray(input.params) || input.params.length !== 1) return fail(400, "bad_params");
  const chain = tempoChain("testnet");
  const parsed = transaction(input.params[0], address, chain.id);
  if (!parsed) return fail(403, "reviewer_policy");
  // One shared account: a fixed daily count bounds total signing even if its testnet balance grows.
  if (!(await ceremonyLimiter().allow("reviewer-transactions", 40, 86_400))) return fail(429, "reviewer_daily_cap");
  try {
    const client = createWalletClient({ account: reviewerAccount(), chain, transport: http(env.rpcHttpUrl) });
    const sent = await sendBatch(client as never, { ...parsed, sponsored: false });
    return Response.json({ result: sent.hash }, { headers: noStore });
  } catch (error) {
    console.error("reviewer transaction failed:", error instanceof Error ? error.message.split("\n")[0] : "unknown error");
    return fail(502, "reviewer_send_failed");
  }
}
