/** The S0 hello actor: reads the Tempo chain head every 10 s so `/health` proves RPC reachability. Signs nothing. */
import { tempoReadClient } from "@cwf/markets";
import type { OpsEnv } from "../../runtime";
import type { PassResult } from "../../runtime";

export const CHAIN_HEAD_EVERY_MS = 10_000;

export function chainHeadPass(env: OpsEnv): () => Promise<PassResult> {
  const client = tempoReadClient(env.network, env.tempoRpcUrl);
  return async () => {
    const block = await client.getBlock();
    const lagMs = Date.now() - Number(block.timestamp) * 1000;
    return { why: `head ${block.number} (${Math.max(0, Math.round(lagMs / 1000))}s old)`, detail: { head: Number(block.number), lagMs } };
  };
}
