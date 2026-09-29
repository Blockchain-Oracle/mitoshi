/**
 * Attested prints ("demo data", opt-in; engine spec A.5.3, D-066): the EIP-712 `Print` and `Spot` structs the
 * `AttestedPrintVerifier` checks, signed by the attestor role (`price-relay` on testnet). The domain's
 * `verifyingContract` is the calling engine, so a signature is bound to engine, chain, market and slot.
 * Ported in role from Agari 03b30ab:services/ops/src/actors/price-relay/attest-sign.ts (ed25519 message → EIP-712).
 */
import { encodeAbiParameters, type Address, type Hex, type LocalAccount } from "viem";

export const ATTESTED_DOMAIN_NAME = "EventsEngine Print";

export const PRINT_TYPES = {
  Print: [
    { name: "marketId", type: "bytes32" },
    { name: "which", type: "uint8" },
    { name: "t", type: "uint40" },
    { name: "price", type: "int64" },
    { name: "expo", type: "int8" },
    { name: "feedId", type: "bytes32" },
    { name: "barStart", type: "uint40" },
    { name: "barLen", type: "uint32" },
    { name: "fetchedAt", type: "uint40" },
  ],
} as const;

export const SPOT_TYPES = {
  Spot: [
    { name: "feedId", type: "bytes32" },
    { name: "price", type: "int64" },
    { name: "expo", type: "int8" },
    { name: "observedAt", type: "uint40" },
  ],
} as const;

export interface AttestedPrintInput {
  engine: Address;
  chainId: number;
  marketId: Hex;
  which: number;
  /** The boundary T. */
  tSec: number;
  feedId: Hex;
  /** The policy's `barLenSec`; the bar is `[T − barLen, T)`. */
  barLenSec: number;
  priceE8: bigint;
  /** When the value was fetched: `T + minDelay ≤ fetchedAt ≤ now`. */
  fetchedAtSec: number;
}

const domain = (engine: Address, chainId: number) => ({ name: ATTESTED_DOMAIN_NAME, version: "1", chainId, verifyingContract: engine });

/** `abi.encode(int64 price, int8 expo, uint40 barStart, uint40 fetchedAt, bytes signature)`: the `recordPrint` proof. */
export async function attestedPrintProof(attestor: LocalAccount, p: AttestedPrintInput): Promise<Hex> {
  const barStart = p.tSec - p.barLenSec;
  const signature = await attestor.signTypedData({
    domain: domain(p.engine, p.chainId),
    types: PRINT_TYPES,
    primaryType: "Print",
    message: { marketId: p.marketId, which: p.which, t: p.tSec, price: p.priceE8, expo: -8, feedId: p.feedId, barStart, barLen: p.barLenSec, fetchedAt: p.fetchedAtSec },
  });
  return encodeAbiParameters([{ type: "int64" }, { type: "int8" }, { type: "uint40" }, { type: "uint40" }, { type: "bytes" }], [p.priceE8, -8, barStart, p.fetchedAtSec, signature]);
}

/** `abi.encode(int64 price, int8 expo, uint40 observedAt, bytes signature)` over `Spot`: a `verifySpot` proof. */
export async function attestedSpotProof(attestor: LocalAccount, p: { engine: Address; chainId: number; feedId: Hex; priceE8: bigint; observedAtSec: number }): Promise<Hex> {
  const signature = await attestor.signTypedData({
    domain: domain(p.engine, p.chainId),
    types: SPOT_TYPES,
    primaryType: "Spot",
    message: { feedId: p.feedId, price: p.priceE8, expo: -8, observedAt: p.observedAtSec },
  });
  return encodeAbiParameters([{ type: "int64" }, { type: "int8" }, { type: "uint40" }, { type: "bytes" }], [p.priceE8, -8, p.observedAtSec, signature]);
}
