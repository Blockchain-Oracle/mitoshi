/**
 * S1 gate, relay leg (plan S1 "Gate"): against a running web app (default http://localhost:3101), a brand-new account
 * that holds nothing sends Multicall3 `getCurrentBlockTimestamp()` with `feePayer: true`. It can only land if our relay
 * pays, so a success receipt whose fee payer is the relay proves sponsorship end to end on Moderato. Then the same
 * account asks for `aggregate3` (a selector that could run arbitrary calls) and must be refused.
 *
 *   pnpm --filter @cwf/scripts exec tsx e2e/relay-noop.ts [baseUrl]
 */
import { createWalletClient, encodeFunctionData, multicall3Abi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { UTILITIES } from "@cwf/clients";
import { TEMPO_RPC_HTTP } from "@cwf/core";
import { sendBatch, tempoChain, tempoTransport } from "@cwf/markets";

const base = process.argv[2] ?? "http://localhost:3101";
const status = (await (await fetch(`${base}/api/relay/status`)).json()) as { feePayer: string; breakerOpen: boolean };
if (status.breakerOpen) throw new Error("relay breaker is open");

const account = privateKeyToAccount(generatePrivateKey());
const client = createWalletClient({
  account,
  chain: tempoChain("testnet"),
  transport: tempoTransport({ rpcHttpUrls: [TEMPO_RPC_HTTP.testnet], relayUrl: `${base}/api/relay` }),
});
const nowSec = Math.floor(Date.now() / 1000);

const noop = encodeFunctionData({ abi: multicall3Abi, functionName: "getCurrentBlockTimestamp" });
const sent = await sendBatch(client, { calls: [{ to: UTILITIES.multicall3, data: noop }], sponsored: true, nonce: { kind: "expiring" }, nowSec });
const feePayer = (sent.receipt as { feePayer?: string }).feePayer;
console.log(JSON.stringify({ leg: "sponsored-noop", sender: account.address, hash: sent.hash, status: sent.receipt.status, block: sent.receipt.blockNumber.toString(), feePayer, relay: status.feePayer }));
if (sent.receipt.status !== "success") throw new Error("no-op reverted");
if (feePayer?.toLowerCase() !== status.feePayer.toLowerCase()) throw new Error(`fee payer ${feePayer} is not the relay ${status.feePayer}`);

const agg = encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [[{ target: UTILITIES.multicall3, allowFailure: true, callData: noop }]] });
try {
  const leaked = await sendBatch(client, { calls: [{ to: UTILITIES.multicall3, data: agg }], sponsored: true, nonce: { kind: "expiring" }, nowSec: Math.floor(Date.now() / 1000) });
  throw new Error(`aggregate3 was sponsored: ${leaked.hash}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("aggregate3 was sponsored")) throw error;
  // viem surfaces only a generic RPC error; the relay's own verdict log names the rule that refused.
  const after = (await (await fetch(`${base}/api/relay/status`)).json()) as { recent: { method: string; ok: boolean; code: string | null }[] };
  const verdict = after.recent.at(-1);
  if (verdict?.ok !== false || verdict.code !== "never") throw new Error(`expected a "never" refusal, got ${JSON.stringify(verdict)}`);
  console.log(JSON.stringify({ leg: "aggregate3-refused", verdict, client: message.split("\n")[0] }));
}
