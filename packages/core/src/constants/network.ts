// Replaces Masayume 68f7a09:packages/core/src/constants/{chain,gas}.ts (Somnia Shannon): Tempo has no gas token, so no
// gas envelope, native precheck or STT faucet list exists here (plan C.2.1).

/** Tempo mainnet 4217 and Moderato testnet 42431 (docs quickstart/connection-details). */
export const NETWORKS = { mainnet: 4217, testnet: 42431 } as const;
export type Network = keyof typeof NETWORKS;

/** The other chains the product touches: Robinhood Chain (stock-token source, D-001) and Base Sepolia (testnet hop, Q-009). */
export const OTHER_CHAINS = { robinhood: 4663, robinhoodTestnet: 46630, baseSepolia: 84532 } as const;

/** Resolves the configured network name, defaulting to testnet. */
export function networkFrom(value: string | undefined): Network {
  return value === "mainnet" ? "mainnet" : "testnet";
}

export function networkOfChainId(chainId: number): Network | null {
  return chainId === NETWORKS.mainnet ? "mainnet" : chainId === NETWORKS.testnet ? "testnet" : null;
}

export const NETWORK_LABEL: Record<Network, string> = { mainnet: "Tempo", testnet: "Tempo Moderato testnet" };

export const TEMPO_RPC_HTTP: Record<Network, string> = { mainnet: "https://rpc.tempo.xyz", testnet: "https://rpc.moderato.tempo.xyz" };
export const TEMPO_RPC_WS: Record<Network, string> = { mainnet: "wss://rpc.tempo.xyz", testnet: "wss://rpc.moderato.tempo.xyz" };
export const TEMPO_EXPLORER: Record<Network, string> = { mainnet: "https://explore.tempo.xyz", testnet: "https://explore.testnet.tempo.xyz" };

/** Every stablecoin amount is a TIP-20 with 6 decimals (pathUSD and the USD stablecoins). */
export const USD_DECIMALS = 6;

/**
 * Expiring nonces (T11): a Tempo tx may carry `validBefore` at most 300 s ahead. Taps use a short window so an absent
 * tx is decided quickly (X21); relay policy refuses anything later than the protocol maximum.
 */
export const EXPIRING_NONCE_MAX_SEC = 300;
export const TAP_VALID_FOR_SEC = 25;
