/** @cwf/core — pure domain logic shared by web, ops and mobile. No network, storage or chain I/O here. */
export const NETWORKS = { mainnet: 4217, testnet: 42431 } as const;
export type Network = keyof typeof NETWORKS;

/** Resolves the configured network name, defaulting to testnet. */
export function networkFrom(value: string | undefined): Network {
  return value === "mainnet" ? "mainnet" : "testnet";
}
