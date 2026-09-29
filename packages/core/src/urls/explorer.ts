// Ported from Masayume 68f7a09:packages/core/src/urls/explorer.ts: Somnia's explorer → Tempo, Robinhood, Base and
// LayerZero explorers (plan C.2.1, L-06).
import { TEMPO_EXPLORER, type Network } from "../constants/network";
import type { Address, Hex } from "../types/primitives";

export type ExplorerChain = "tempo" | "robinhood" | "base" | "layerzero";

const EXPLORERS: Record<ExplorerChain, Record<Network, string>> = {
  tempo: TEMPO_EXPLORER,
  robinhood: { mainnet: "https://explorer.chain.robinhood.com", testnet: "https://explorer.testnet.chain.robinhood.com" },
  base: { mainnet: "https://basescan.org", testnet: "https://sepolia.basescan.org" },
  layerzero: { mainnet: "https://layerzeroscan.com", testnet: "https://testnet.layerzeroscan.com" },
};

export function explorerBase(network: Network, chain: ExplorerChain = "tempo"): string {
  return EXPLORERS[chain][network];
}

export function txUrl(hash: Hex, network: Network, chain: ExplorerChain = "tempo"): string {
  return `${explorerBase(network, chain)}/tx/${hash}`;
}

export function addressUrl(address: Address, network: Network, chain: ExplorerChain = "tempo"): string {
  return `${explorerBase(network, chain)}/address/${address}`;
}

/** A LayerZero message by its guid (bridges, S14). */
export function layerZeroMessageUrl(guid: Hex, network: Network): string {
  return `${EXPLORERS.layerzero[network]}/tx/${guid}`;
}
