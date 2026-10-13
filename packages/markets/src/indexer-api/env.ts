/**
 * The indexer client from the process env (D-086), first match wins:
 *   TIDX_URL (+ TIDX_BASIC_AUTH)       → our self-hosted tidx
 *   TEMPO_INDEXER_API_KEY              → the Tempo API with a key
 *   INDEXER_VIA_MPP=1 + the MPP payer  → the Tempo API paid per query (session; mainnet needs Q-020's go)
 * Every client is paced under its key's rate limit (`./pacer`, R6): the sandbox key allows 20 queries a minute.
 * Server-only (reads keys).
 */
import { getAddress, isAddress, type Hex } from "viem";
import { NETWORKS, networkFrom, type Network } from "@cwf/core";
import { mppCapsFromEnv } from "../mpp/env";
import { createMppSession } from "../mpp/payer";
import type { ReceiptSink } from "../mpp/receipts";
import { createIndexerClient, type IndexerClient } from "./client";
import { createIndexerPacer, type PacerOptions } from "./pacer";

export type IndexerFromEnv = { client: IndexerClient; network: Network } | { client: null; reason: string };

/** Channel deposit for indexer queries: 100 queries at the X10 price (100 base each). */
export const INDEXER_SESSION_DEPOSIT_BASE = 10_000n;

export function indexerClientFromEnv(env: NodeJS.ProcessEnv = process.env, sink?: ReceiptSink, pacing: PacerOptions = {}): IndexerFromEnv {
  const network = networkFrom(env.NETWORK);
  const chainId = NETWORKS[network];
  const options = { pacer: createIndexerPacer(pacing) };
  const tidxUrl = env.TIDX_URL?.trim();
  if (tidxUrl) return { client: createIndexerClient(chainId, { kind: "self-hosted", baseUrl: tidxUrl, ...(env.TIDX_BASIC_AUTH ? { basicAuth: env.TIDX_BASIC_AUTH } : {}) }, options), network };
  const apiKey = env.TEMPO_INDEXER_API_KEY?.trim();
  if (apiKey) return { client: createIndexerClient(chainId, { kind: "api-key", apiKey }, options), network };
  if (env.INDEXER_VIA_MPP === "1") {
    const key = env.MPP_PAYER_PRIVATE_KEY?.trim();
    const root = env.MPP_ROOT_ADDRESS?.trim();
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key) || !root || !isAddress(root)) return { client: null, reason: "INDEXER_VIA_MPP=1 needs MPP_PAYER_PRIVATE_KEY and MPP_ROOT_ADDRESS" };
    if (network === "mainnet" && env.MPP_MAINNET_APPROVED !== "1") return { client: null, reason: "mainnet MPP waits for the owner's go (Q-020)" };
    const session = createMppSession({
      network,
      privateKey: key as Hex,
      root: getAddress(root),
      caps: mppCapsFromEnv(network, env),
      maxDepositBase: INDEXER_SESSION_DEPOSIT_BASE,
      ...(sink ? { sink } : {}),
      ...(env.TEMPO_RPC_HTTP_URL ? { rpcUrl: env.TEMPO_RPC_HTTP_URL } : {}),
    });
    return { client: createIndexerClient(chainId, { kind: "mpp", session }, options), network };
  }
  return { client: null, reason: "no indexer configured: set TIDX_URL, TEMPO_INDEXER_API_KEY, or INDEXER_VIA_MPP=1 with the MPP payer" };
}
