// Ported from Masayume 68f7a09:packages/core/src/private/protocol.ts
import type { Side } from "../types/market";
import { formatCadence } from "../copy/between-rounds";
import { formatBaseUnits } from "../units/format";

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

/** The collateral the stake is named in on the signed text (the TIP-20's own symbol). */
export const PRIVATE_STAKE_SYMBOL = "pathUSD";

export interface PrivateOpenFacts {
  owner: string;
  contract: string;
  chainId: number;
  marketId: string;
  asset: string;
  intervalSec: number;
  expirySec: number;
  side: Side;
  stakeBase: bigint;
  issuedAtMs: number;
  commitment: string;
}

/** The one builder the browser and the route share, so the text the passkey signs and the text the route checks are the same bytes. */
export function privateOpenText(f: PrivateOpenFacts): string {
  return privateOpenMessage({
    ...f,
    cadenceText: formatCadence(f.intervalSec),
    // Exact to the base unit, so the prompt and the charge can never differ by what a rounding hid.
    stakeText: formatBaseUnits(f.stakeBase, 6, { maxDp: 6, minDp: 0, group: false }),
    symbol: PRIVATE_STAKE_SYMBOL,
  });
}

export function privateAuthFresh(issuedAtMs: number, nowMs: number): boolean {
  const age = nowMs - issuedAtMs;
  return age <= PRIVATE_AUTH_TTL_MS && age >= -PRIVATE_AUTH_FUTURE_SLACK_MS;
}

/** The backup file: plain JSON on purpose — it has to survive a lost laptop, a new device, and this app going away. */
export const PRIVATE_BACKUP_KIND = "mitoshi.private.claims";
export const PRIVATE_BACKUP_VERSION = 1;

// The request and ticket schemas (zod) live in `protocol-schema.ts`, for the servers that parse them (S23 gate).
export type { PrivateCashoutRequest, PrivateOpenRequest } from "./protocol-schema";
