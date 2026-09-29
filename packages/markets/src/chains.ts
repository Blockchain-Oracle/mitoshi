/**
 * The chains the product touches (plan C.2.4 `chains.ts`; C.3.1 two-wallet model). Tempo chains come from viem's own
 * definitions (the Tempo `chainConfig`: fee-token formatters, expiring nonces, envelope-aware `verifyHash`); Robinhood
 * Chain and Base Sepolia from `viem/chains`.
 */
import { baseSepolia, robinhood, robinhoodTestnet, tempo, tempoModerato } from "viem/chains";
import type { Chain } from "viem";
import { NETWORKS, type Network } from "@cwf/core";
import { TEMPO } from "@cwf/clients";

export { baseSepolia, robinhood, robinhoodTestnet, tempo, tempoModerato };

/** pathUSD: the fee token on every send (N-12) and the collateral of every market. */
export const PATH_USD = TEMPO.pathUSD;

/** The Tempo chain for a network, with pathUSD set as the default fee token. */
export function tempoChain(network: Network) {
  const base = network === "mainnet" ? tempo : tempoModerato;
  return base.extend({ feeToken: PATH_USD });
}

export type TempoChain = ReturnType<typeof tempoChain>;

/** The two-wallet model's other side: Robinhood Chain (+ Base Sepolia as the testnet hop, Q-009). */
export function sideChains(network: Network): readonly Chain[] {
  return network === "mainnet" ? [robinhood] : [robinhoodTestnet, baseSepolia];
}

export function isTempoChainId(chainId: number): boolean {
  return chainId === NETWORKS.mainnet || chainId === NETWORKS.testnet;
}

