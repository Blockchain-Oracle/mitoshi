// Replaces Masayume 68f7a09:packages/core/src/constants/faucet.ts (Somnia tUSDC + STT lists): on Moderato the
// faucet is the node's own `tempo_fundAddress` (plan C.3.4); mainnet has none (L-26).

/** What one `tempo_fundAddress` call sends: 1,000,000 of each of four testnet stablecoins (docs, L-25). */
export const MODERATO_FAUCET_UNITS = 1_000_000n;
export const MODERATO_FAUCET_TOKENS = 4;
