// Ported from Masayume 68f7a09:packages/core/src/private/types.ts
import type { MarketId, Side } from "../types/market";
import type { Address, Bytes32, Hex } from "../types/primitives";

/** Where the desk lives on one chain — regenerated from `contracts/deployments` (AD-10). */
export interface PrivateDeployment {
  chainId: number;
  privateDesk: Address;
  fromBlock: bigint;
}

export interface PrivateParams {
  minStakeBase: bigint;
  maxStakeBase: bigint;
  minTimeLeftSec: number;
}

/** The desk's own sheet: who signs, what it owes, and its tunables. */
export interface PrivateDeskState {
  deployment: PrivateDeployment;
  params: PrivateParams;
  /** The key pinned on the contract — what every claim is verified against. */
  desk: Address;
  paused: boolean;
  poolBase: bigint;
  owedBase: bigint;
  inSlotsBase: bigint;
  decimals: number;
}

/** An owner's money behind private bets: theirs to withdraw, the desk's to spend inside the allowance. */
export interface PrivateBudget {
  balanceBase: bigint;
  allowanceBase: bigint;
  /** What a private bet can spend right now: the balance, but never more than the desk may spend. */
  spendableBase: bigint;
}

/** One bet's throwaway slot as the contract records it — no owner on it, by design. */
export interface PrivateSlot {
  slotId: Bytes32;
  marketId: MarketId | null;
  side: Side | null;
  fundedAtSec: number;
  mintedAtSec: number;
  settledAtSec: number;
  expirySec: number;
  quantityRaw: bigint;
  balanceBase: bigint;
  costBase: bigint;
  payoutBase: bigint;
  sweptBase: bigint;
}

/** The stake-first quote the desk contract gives (`sizeForStake`): every figure the contract's own. */
export interface PrivateQuote {
  side: Side;
  stakeBase: bigint;
  quantityRaw: bigint;
  costBase: bigint;
  limitYesRaw: bigint;
  priceRaw: bigint;
  decimals: number;
  quotedAtMs: number;
}

/** The owner's own writes, on the tx lane. The desk's three-transaction open is the service's, never the wallet's. */
export type PrivateIntent =
  /** Top up and authorise in one signature; a zero amount is a plain re-allow. */
  | { kind: "private-deposit-and-allow"; amountBase: bigint; allowanceBase: bigint }
  | { kind: "private-allow"; allowanceBase: bigint }
  | { kind: "private-revoke" }
  | { kind: "private-withdraw"; amountBase: bigint }
  /** Permissionless: anyone may settle a slot whose Window the venue resolved or voided. */
  | { kind: "private-settle"; slotId: Bytes32; marketId: MarketId };

export const PRIVATE_NOT_DEPLOYED = "PrivateDesk is not deployed on this network yet" as const;

/**
 * The claim: what the desk signs and the owner alone keeps. The chain holds no owner on any slot, so
 * losing this is losing the ability to cash the bet out — by design, and said so on every surface.
 * Bigints travel as decimal strings: this shape IS the wire and the backup file.
 */
export interface PrivateClaim {
  owner: Address;
  slotId: Bytes32;
  creditKey: Bytes32;
  marketId: MarketId;
  outcomeIdx: 0 | 1;
  stakeBase: string;
  issuedAtMs: number;
}

/** EIP-712: the struct the desk signs over the claim. Append-only — reordering a field invalidates every outstanding ticket. */
export const PRIVATE_CLAIM_TYPES = {
  Claim: [
    { name: "owner", type: "address" },
    { name: "slotId", type: "bytes32" },
    { name: "creditKey", type: "bytes32" },
    { name: "marketId", type: "bytes32" },
    { name: "outcomeIdx", type: "uint8" },
    { name: "stake", type: "uint256" },
    { name: "issuedAtMs", type: "uint64" },
  ],
} as const;
export const PRIVATE_CLAIM_DOMAIN_NAME = "Masayume Private Desk";
export const PRIVATE_CLAIM_DOMAIN_VERSION = "1";

export type PrivateTicketStatus = "open" | "settled" | "credited";

/** A claim plus what the owner's browser knows about the bet it names — the row the claims list renders. */
export interface PrivateTicket {
  claim: PrivateClaim;
  signature: Hex;
  /** The key that signed, and the contract that pins it, so a ticket verifies without asking the desk. */
  desk: Address;
  contract: Address;
  chainId: number;
  asset: string;
  intervalSec: number;
  expirySec: number;
  quantityRaw: string;
  costBase: string;
  txs: { charge: Hex; fund: Hex; mint: Hex };
  openedAtMs: number;
  status: PrivateTicketStatus;
  /** What the contracts paid at settlement; absent when this browser never saw the settlement itself. */
  payoutBase?: string;
  /** What reached the private balance (payout plus dust). */
  creditedBase?: string;
  creditedAtMs?: number;
  creditTx?: Hex;
}

/** `GET /api/private/status` — whether the private route can run, and why not. */
export interface PrivateStatus {
  ready: boolean;
  reasons: string[];
  /** Honest about what the route is: a desk-signed slot, not an attested enclave, not a mixer. */
  mode: "desk-signed-slot";
  desk: Address | null;
  contract: Address | null;
  chainId: number;
  minStakeBase: string | null;
  maxStakeBase: string | null;
  paused: boolean;
}

export type PrivateOpenResult =
  | { status: "opened"; ticket: PrivateTicket }
  /** The book refused the mint; the stake went straight back to the private balance. */
  | { status: "refused"; reason: string; technical: string; refundedBase: string; txs: Partial<{ charge: Hex; fund: Hex; sweep: Hex; credit: Hex }> }
  | { status: "unknown"; reason: string; txs: Partial<{ charge: Hex; fund: Hex; mint: Hex }> };

export type PrivateCashoutResult =
  /** The Window has not settled yet; nothing moved. */
  | { status: "open"; expirySec: number }
  /** Settled, swept and credited — `payoutBase` is what the contracts paid, `creditedBase` what reached the balance (payout plus dust). */
  | { status: "credited"; payoutBase: string; creditedBase: string; txs: Partial<{ settle: Hex; sweep: Hex; credit: Hex }> }
  /** Already home: nothing left in the slot and nothing owed. */
  | { status: "done"; creditedBase: string };
