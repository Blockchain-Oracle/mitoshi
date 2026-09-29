// Ported from Masayume 68f7a09:packages/core/src/faucet/index.ts: the challenge + quota pattern kept, the STT policy
// replaced by the Moderato `tempo_fundAddress` policy (plan C.3.4, L-25). Pure: the route does the I/O.
import type { Address, Hex } from "../types/primitives";

/** Moderato funding policy. No amounts: the node decides them (1M of each of four stablecoins). */
export const TEMPO_FAUCET_POLICY = {
  chainId: 42431,
  /** One funding per wallet per day. */
  cooldownMs: 86_400_000,
  challengeTtlMs: 300_000,
  maxPerIpPerDay: 10,
  /** Global cap across all wallets per day (a spent node faucet refuses anyway; this keeps abuse off our quota). */
  maxPerDay: 5_000,
} as const;

export type FaucetClaimStatus = "funded" | "refused" | "failed";

/** How a claim was authorised: a signed challenge, or the passkey session of the one-ceremony sign-up (D-046). */
export type FaucetAuth = "signature" | "passkey-session";

export interface FaucetClaim {
  id: string;
  wallet: Address;
  ipHash: string;
  auth: FaucetAuth;
  txHashes: Hex[];
  status: FaucetClaimStatus;
  createdAtMs: number;
}

export interface FaucetChallenge {
  id: string;
  wallet: Address;
  ipHash: string;
  message: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface FaucetClaimView {
  id: string;
  txHashes: Hex[];
  status: FaucetClaimStatus;
  nextClaimAtMs: number;
}

/** What `/api/faucet` answers on GET: whether funding is possible now for this wallet. */
export interface FaucetStatus {
  /** False on mainnet: there is no faucet, and the UI shows funding options instead (L-26). */
  available: boolean;
  claim: FaucetClaimView | null;
  message: string;
}

export function faucetClaimView(claim: FaucetClaim): FaucetClaimView {
  return { id: claim.id, txHashes: claim.txHashes, status: claim.status, nextClaimAtMs: claim.createdAtMs + TEMPO_FAUCET_POLICY.cooldownMs };
}

/** The earliest the wallet may claim again, or null when it may claim now. */
export function faucetCooldownUntilMs(last: FaucetClaim | null, nowMs: number): number | null {
  if (!last || last.status !== "funded") return null;
  const until = last.createdAtMs + TEMPO_FAUCET_POLICY.cooldownMs;
  return nowMs < until ? until : null;
}

/** The text a wallet signs to ask for test funds. It names what it allows and what it doesn't. */
export function faucetChallengeMessage(input: { brand: string; origin: string; wallet: string; id: string; expiresAtMs: number }): string {
  return [
    `${input.brand} testnet funds request`,
    `Site: ${input.origin}`,
    `Wallet: ${input.wallet.toLowerCase()}`,
    "Network: Tempo Moderato testnet (42431)",
    "Request: send this wallet test stablecoins once today; subject to availability and limits.",
    `Nonce: ${input.id}`,
    `Expires: ${new Date(input.expiresAtMs).toISOString()}`,
    "This message costs nothing and gives no permission to spend my funds.",
  ].join("\n");
}

export class FaucetError extends Error {
  constructor(public readonly code: string, message: string, public readonly httpStatus = 409) { super(message); }
}
