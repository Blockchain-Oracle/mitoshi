// Ported from Masayume 68f7a09:packages/core/src/urls/explorer.ts: Somnia's explorer → Tempo's (plan C.2.1, L-06).
// D-231 removed the bridge's Robinhood, Base and LayerZero explorers.
import { TEMPO_EXPLORER, type Network } from "../constants/network";
import type { Address, Hex } from "../types/primitives";

export type ExplorerChain = "tempo";

const EXPLORERS: Record<ExplorerChain, Record<Network, string>> = {
  tempo: TEMPO_EXPLORER,
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
