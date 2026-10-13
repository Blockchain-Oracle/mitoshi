/**
 * The chain the product touches (plan C.2.4 `chains.ts`): Tempo, from viem's own definitions (the Tempo `chainConfig`:
 * fee-token formatters, expiring nonces, envelope-aware `verifyHash`). D-231 removed the bridge's side chains.
 */
import { tempo, tempoModerato } from "viem/chains";
import { NETWORKS, type Network } from "@cwf/core";
import { UTILITIES } from "@cwf/clients";
import { PATH_USD } from "./path-usd";

export { tempo, tempoModerato };

/**
 * The Tempo chain for a network, with pathUSD as the default fee token and Multicall3 declared: viem's Tempo chains
 * omit it, though it is deployed at the canonical address on both networks (verified), so batched reads work.
 */
export function tempoChain(network: Network) {
  const base = (network === "mainnet" ? tempo : tempoModerato).extend({ feeToken: PATH_USD });
  return { ...base, contracts: { ...base.contracts, multicall3: { address: UTILITIES.multicall3 as `0x${string}` } } };
}

export type TempoChain = ReturnType<typeof tempoChain>;

export function isTempoChainId(chainId: number): boolean {
  return chainId === NETWORKS.mainnet || chainId === NETWORKS.testnet;
}

