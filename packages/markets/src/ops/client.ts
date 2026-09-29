/**
 * The ops actors' chain client (plan C.2.4 `sessions/*` "secp256k1 local for ops"; C.5.1). One per role key: a public
 * client for reads (Multicall3 batched) and, when the role key is present, a wallet client that signs Tempo
 * transactions paying fees in pathUSD. Without a key the client reads only and every send refuses (the actor is dry).
 * Ported in shape from Agari 03b30ab:packages/markets/src/ops/client.ts (`createOpsClient`), Solana RPC → viem.
 */
import { createPublicClient, createWalletClient, http, type Account, type Address, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { UTILITIES } from "@cwf/clients";
import { NETWORKS, TEMPO_RPC_HTTP, type Network } from "@cwf/core";
import { tempoChain, type TempoChain } from "../chains";

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
}

export function createOpsClient(input: OpsClientInput): OpsClient {
  const chain = tempoChain(input.network);
  const transport = http(input.rpcUrl || TEMPO_RPC_HTTP[input.network], { batch: { wait: 10 }, retryCount: 3, timeout: 30_000 });
  const pub = createPublicClient({ chain: { ...chain, contracts: { ...chain.contracts, multicall3: { address: UTILITIES.multicall3 as Address } } }, transport, batch: { multicall: { wait: 10 } } }) as unknown as PublicClient;
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
