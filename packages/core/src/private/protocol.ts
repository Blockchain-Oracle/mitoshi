// Ported from Masayume 68f7a09:packages/core/src/private/protocol.ts
import { z } from "zod";
import type { Side } from "../types/market";
import { addressSchema, bytes32Schema } from "../schemas/primitives";

/** A signed authorisation is only good for a few minutes, so a captured one cannot be replayed later. */
export const PRIVATE_AUTH_TTL_MS = 5 * 60_000;
/** A clock skewed forward would otherwise mint an authorisation that stays valid longer than the window allows. */
export const PRIVATE_AUTH_FUTURE_SLACK_MS = 60_000;
/** The reference's own one-liner, kept honest: link-reduction, not anonymity. */
export const PRIVATE_HONESTY = "Kept separate from your wallet, so it is harder to link back to you — not anonymous.";

export interface PrivateOpenMessageInput {
  owner: string;
  /** The desk contract and its chain, so a signature for one deployment never opens a bet on another. */
  contract: string;
  chainId: number;
  marketId: string;
  asset: string;
  cadenceText: string;
  expirySec: number;
  side: Side;
  stakeText: string;
  symbol: string;
  issuedAtMs: number;
  /** `keccak256(secret)`: the browser's 32-byte secret the bet's keys derive from (C.2.4 — P-256 signatures are randomised). */
  commitment: string;
}

/**
 * The exact text the wallet signs to authorise one private bet — the reference's `openAuthMessage`,
 * built to be READ, not just verified: the prompt names the actual bet ("UP, 10.00 pathUSD on BTC 5m")
 * rather than a hash. The browser and the desk build it from the same fields; any drift refuses loudly.
 * The committed secret (not the signature — P-256 signatures are randomised) seeds the bet's three keys.
 */
export function privateOpenMessage(input: PrivateOpenMessageInput): string {
  return [
    "Mitoshi — private bet",
    "",
    `Side: ${input.side.toUpperCase()}`,
    `Stake: ${input.stakeText} ${input.symbol}`,
    `Window: ${input.asset} ${input.cadenceText}, closes ${new Date(input.expirySec * 1000).toISOString()}`,
    `Market: ${input.marketId}`,
    `Desk: ${input.contract.toLowerCase()} on chain ${input.chainId}`,
    `Wallet: ${input.owner.toLowerCase()}`,
    `Keys: ${input.commitment.toLowerCase()}`,
    `Issued: ${new Date(input.issuedAtMs).toISOString()}`,
    "",
    `Signing lets the desk place this one bet from your private balance. It moves no funds by itself and costs nothing. ${PRIVATE_HONESTY}`,
  ].join("\n");
}

export function privateAuthFresh(issuedAtMs: number, nowMs: number): boolean {
  const age = nowMs - issuedAtMs;
  return age <= PRIVATE_AUTH_TTL_MS && age >= -PRIVATE_AUTH_FUTURE_SLACK_MS;
}

const decimalString = z.string().regex(/^\d+$/);
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]+$/).max(2_000);

export const privateClaimSchema = z.object({
  owner: addressSchema,
  slotId: bytes32Schema,
  creditKey: bytes32Schema,
  marketId: bytes32Schema,
  outcomeIdx: z.union([z.literal(0), z.literal(1)]),
  stakeBase: decimalString,
  issuedAtMs: z.number().int().positive(),
});

/**
 * `POST /api/private/open` — the bet the owner signed, plus the signature that proves it. Only the facts
 * travel: the route rebuilds the message from the chain's own Window and the collateral, so a caller's
 * strings can never describe a different bet from the one charged.
 */
export const privateOpenRequestSchema = z.object({
  owner: addressSchema,
  marketId: bytes32Schema,
  side: z.enum(["up", "down"]),
  stakeBase: decimalString,
  /** The owner's guard against a book that moved since the quote: fewer contracts than this and the desk refunds. */
  minQuantityRaw: decimalString,
  issuedAtMs: z.number().int().positive(),
  signature: signatureSchema,
  /** The 32-byte secret the signed text commits to (`Keys: keccak256(secret)`); the desk derives the slot's keys from it. */
  secret: bytes32Schema,
});
export type PrivateOpenRequest = z.infer<typeof privateOpenRequestSchema>;

/** `POST /api/private/cashout` — the claim and nothing else: the owner is read out of the signed bytes. */
export const privateCashoutRequestSchema = z.object({
  claim: privateClaimSchema,
  signature: signatureSchema,
});
export type PrivateCashoutRequest = z.infer<typeof privateCashoutRequestSchema>;

const hexString = z.string().regex(/^0x[0-9a-fA-F]*$/);

/** One stored claim, checked field by field on restore so a hand-edited backup can never brick the list that is the only record of unclaimed money. */
export const privateTicketSchema = z.object({
  claim: privateClaimSchema,
  signature: signatureSchema,
  desk: addressSchema,
  contract: addressSchema,
  chainId: z.number().int().positive(),
  asset: z.string().min(1).max(16),
  intervalSec: z.number().int().positive(),
  expirySec: z.number().int().positive(),
  quantityRaw: decimalString,
  costBase: decimalString,
  txs: z.object({ charge: hexString, fund: hexString, mint: hexString }),
  openedAtMs: z.number().int().positive(),
  status: z.enum(["open", "settled", "credited"]),
  payoutBase: decimalString.optional(),
  creditedBase: decimalString.optional(),
  creditedAtMs: z.number().int().positive().optional(),
  creditTx: hexString.optional(),
});

/** The backup file: plain JSON on purpose — it has to survive a lost laptop, a new device, and this app going away. */
export const PRIVATE_BACKUP_KIND = "mitoshi.private.claims";
export const PRIVATE_BACKUP_VERSION = 1;
