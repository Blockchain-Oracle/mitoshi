/**
 * The ops actors' chain client (plan C.2.4 `sessions/*` "secp256k1 local for ops"; C.5.1). One per role key: a public
 * client for reads (Multicall3 batched) and, when the role key is present, a wallet client that signs Tempo
 * transactions paying fees in pathUSD. Without a key the client reads only and every send refuses (the actor is dry).
 * Ported in shape from Agari 03b30ab:packages/markets/src/ops/client.ts (`createOpsClient`), Solana RPC → viem.
 */
import { createPublicClient, createWalletClient, type Account, type Address, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { UTILITIES } from "@cwf/clients";
import { NETWORKS, TEMPO_RPC_HTTP, type Network } from "@cwf/core";
import { tempoChain, type TempoChain } from "../chains";
import { MULTICALL_CHUNK_BYTES, tempoHttp } from "../rpc-http";
import { sharedRpcBudget, type RpcBudget, type RpcTier } from "../rpc-budget";

export interface OpsClient {
  network: Network;
  chainId: number;
  chain: TempoChain;
  public: PublicClient;
  /** Null when the role key is missing: reads only. */
  wallet: WalletClient<Transport, TempoChain, Account> | null;
  /** The role's address (the key's), or null without a key. */
  address: Address | null;
}

export interface OpsClientInput {
  network: Network;
  rpcUrl?: string;
  /** 0x-prefixed secp256k1 key; never logged. */
  privateKey?: Hex | null;
  /** Tests: the fetch the transport sends through. */
  fetchFn?: typeof fetch;
  /** Request units per second for this URL's shared budget; default `TEMPO_RPC_UNITS_PER_SEC` or 30; 0 = unpaced. */
  unitsPerSec?: number;
  /** Tests: a budget of their own instead of the process-wide one. */
  budget?: RpcBudget;
  /** Queue place in the shared budget: 0 the print path (relay, roller, settler), 1 the house, 2 bookkeeping. */
  tier?: RpcTier;
  /** Transport retries (default 5) and answer size cap (viem's 10 MiB): a log walk lowers one and raises the other. */
  retryCount?: number;
  maxResponseBodySize?: number;
}

/** Below the public RPC's measured ≈ 36 units/s per IP (D-134). */
export const DEFAULT_RPC_UNITS_PER_SEC = 30;
const opsUnitsPerSec = () => {
  const n = Number(process.env.TEMPO_RPC_UNITS_PER_SEC);
  return process.env.TEMPO_RPC_UNITS_PER_SEC !== undefined && Number.isFinite(n) && n >= 0 ? n : DEFAULT_RPC_UNITS_PER_SEC;
};

export function createOpsClient(input: OpsClientInput): OpsClient {
  const chain = tempoChain(input.network);
  // No JSON-RPC batching: the public RPC refuses batches over a small weight budget, whole (D-130, `../rpc-http`).
  // All actors share one request budget per URL, the container's IP limit (D-134); 0 turns pacing off.
  const url = input.rpcUrl || TEMPO_RPC_HTTP[input.network];
  const units = input.unitsPerSec ?? opsUnitsPerSec();
  const transport = tempoHttp(url, {
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(units > 0 ? { budget: input.budget ?? sharedRpcBudget(url, units), tier: input.tier ?? 1 } : {}),
    ...(input.retryCount !== undefined ? { retryCount: input.retryCount } : {}),
    ...(input.maxResponseBodySize ? { maxResponseBodySize: input.maxResponseBodySize } : {}),
  });
  const pub = createPublicClient({ chain: { ...chain, contracts: { ...chain.contracts, multicall3: { address: UTILITIES.multicall3 as Address } } }, transport, batch: { multicall: { wait: 10, batchSize: MULTICALL_CHUNK_BYTES } } }) as unknown as PublicClient;
  const account = input.privateKey ? privateKeyToAccount(input.privateKey) : null;
  const wallet = account ? createWalletClient({ account, chain, transport }) : null;
  return { network: input.network, chainId: NETWORKS[input.network], chain, public: pub, wallet, address: account?.address ?? null };
}

/** The chain clock: the latest block's timestamp (Tempo finalizes each block, so `latest` is final). */
export async function chainNowSec(client: OpsClient): Promise<number> {
  const block = await client.public.getBlock({ blockTag: "latest" });
  return Number(block.timestamp);
}

export const MULTICALL3 = UTILITIES.multicall3 as Address;
