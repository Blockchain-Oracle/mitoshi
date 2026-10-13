/**
 * Bridge writes on Tempo (S14w; D-227 R4-12). Bridging in signs on Robinhood Chain with the linked wallet (not a Tempo
 * intent); bridging out and the two exits run through the Tempo submitter like any other write. Amounts are the
 * mirror's own units (6 dp = shared); `feeBase` is the LayerZero fee quoted in LZD, paid in pathUSD 1:1.
 */
import type { Address } from "../types/primitives";

/** The tickers the testnet mesh bridges (the Robinhood testnet faucet's five; plan ST-01). */
export const BRIDGE_TICKERS = ["TSLA", "AMZN", "PLTR", "NFLX", "AMD"] as const;
export type BridgeTicker = (typeof BRIDGE_TICKERS)[number];

export function isBridgeTicker(v: string): v is BridgeTicker {
  return (BRIDGE_TICKERS as readonly string[]).includes(v);
}

export type BridgeIntent =
  /** Burn `amountSD` bT on Tempo and deliver T to `recipient` on Robinhood Chain (via the Base hop on testnet). */
  | { kind: "bridge-send"; ticker: BridgeTicker; amountSD: bigint; recipient: Address; feeBase: bigint }
  /** Mint what an earlier credit deferred, once nothing blocks it (relay-sponsored, an exit). */
  | { kind: "bridge-claim-deferred"; ticker: BridgeTicker }
  /** Send a deferred credit straight back to Robinhood Chain (relay-sponsored gas; the LayerZero fee is the holder's). */
  | { kind: "bridge-send-deferred"; ticker: BridgeTicker; amountSD: bigint; recipient: Address; feeBase: bigint };

/** Why the destination held a credit (contracts/src/common/BridgeTypes.sol `DeferReason`, in order; B.1.4). */
export const DEFER_REASONS = ["none", "invalid-recipient", "token-paused", "policy", "supply-cap", "rate-limit", "receive-policy", "call-reverted"] as const;
export type DeferReason = (typeof DEFER_REASONS)[number];
