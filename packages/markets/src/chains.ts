/**
 * The chains the product touches (plan C.2.4 `chains.ts`; C.3.1 two-wallet model). Tempo chains come from viem's own
 * definitions (the Tempo `chainConfig`: fee-token formatters, expiring nonces, envelope-aware `verifyHash`); Robinhood
 * Chain and Base Sepolia from `viem/chains`.
 */
import { baseSepolia, robinhood, robinhoodTestnet, tempo, tempoModerato } from "viem/chains";
import type { Chain } from "viem";
import { NETWORKS, type Network } from "@cwf/core";
import { UTILITIES } from "@cwf/clients";
import { PATH_USD } from "./path-usd";

export { baseSepolia, robinhood, robinhoodTestnet, tempo, tempoModerato };

/**
 * The Tempo chain for a network, with pathUSD as the default fee token and Multicall3 declared: viem's Tempo chains
 * omit it, though it is deployed at the canonical address on both networks (verified), so batched reads work.
 */
export function tempoChain(network: Network) {
  const base = (network === "mainnet" ? tempo : tempoModerato).extend({ feeToken: PATH_USD });
  return { ...base, contracts: { ...base.contracts, multicall3: { address: UTILITIES.multicall3 as `0x${string}` } } };
}

export type TempoChain = ReturnType<typeof tempoChain>;

/** The two-wallet model's other side: Robinhood Chain (+ Base Sepolia as the testnet hop, Q-009). */
export function sideChains(network: Network): readonly Chain[] {
  return network === "mainnet" ? [robinhood] : [robinhoodTestnet, baseSepolia];
}

export function isTempoChainId(chainId: number): boolean {
  return chainId === NETWORKS.mainnet || chainId === NETWORKS.testnet;
}

