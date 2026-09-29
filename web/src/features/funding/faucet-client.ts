/**
 * The browser half of `/api/faucet` (plan C.3.4). Two ways in: the passkey session (no signature, D-046) or a signed
 * one-time challenge for wallets. Answers are typed; every failure maps to one of `FUNDING.errors`.
 */
import type { Hex } from "@cwf/core";
import type { FaucetStatus } from "@cwf/core/faucet";
import type { FaucetErrorCode } from "./copy";

export interface FundedClaim {
  id: string;
  txHashes: Hex[];
  nextClaimAtMs: number;
}

export type ClaimResult = { ok: true; claim: FundedClaim } | { ok: false; code: FaucetErrorCode; nextClaimAtMs: number | null };

const KNOWN = new Set<string>(["cooldown", "ip_quota", "daily_cap", "region_restricted", "no_session", "challenge_expired", "bad_signature", "unavailable", "fund_failed"]);

async function read(response: Response): Promise<ClaimResult> {
  const body = (await response.json().catch(() => ({}))) as { claim?: FundedClaim; error?: string; nextClaimAtMs?: number | null };
  if (response.ok && body.claim) return { ok: true, claim: body.claim };
  const code = (body.error && KNOWN.has(body.error) ? body.error : response.status === 451 ? "region_restricted" : "unknown") as FaucetErrorCode;
  return { ok: false, code, nextClaimAtMs: body.nextClaimAtMs ?? null };
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The passkey path: the `Handler.webAuthn` session cookie proves the address. */
export async function claimWithSession(): Promise<ClaimResult> {
  return read(await post("/api/faucet", {}));
}

/** The wallet path: ask for a challenge, have the wallet sign it (EIP-191), claim with the signature. */
export async function claimWithSignature(wallet: string, sign: (message: string) => Promise<Hex>): Promise<ClaimResult> {
  const challenge = await post("/api/faucet/challenge", { wallet });
  if (!challenge.ok) return read(challenge);
  const { id, message } = (await challenge.json()) as { id: string; message: string };
  const signature = await sign(message);
  return read(await post("/api/faucet", { challengeId: id, signature }));
}

export interface FaucetAvailability {
  available: boolean;
  /** Why not, as a `FUNDING.errors` key; null when available. */
  reason: FaucetErrorCode | null;
  nextClaimAtMs: number | null;
}

/** Whether this wallet may claim now — read when the dialog opens, so it never offers a button that will refuse. */
export async function faucetAvailability(wallet: string): Promise<FaucetAvailability> {
  const response = await fetch(`/api/faucet?wallet=${wallet}`, { credentials: "same-origin" });
  if (!response.ok) return { available: false, reason: response.status === 503 ? "unavailable" : "unknown", nextClaimAtMs: null };
  const body = (await response.json()) as FaucetStatus;
  const reason: FaucetErrorCode | null = body.available ? null : body.reason === "available" ? "unknown" : body.reason;
  return { available: body.available, reason, nextClaimAtMs: body.claim?.nextClaimAtMs ?? null };
}
