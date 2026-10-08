// Ported from Masayume 68f7a09:web/src/features/session/view.ts — the one place tap-trading's status is decided, from
// facts only: the vault snapshot (null = no vault on this network), this browser's key, and the chain-corrected time
// the grant's expiry is compared with. No gas line: the relay pays every tap (Tempo has no gas token).
import type { Address, VaultGrant, VaultSnapshot } from "@cwf/core";

export type SessionStatus = "no-wallet" | "not-passkey" | "not-deployed" | "loading" | "disarmed" | "armed" | "grant-without-key" | "expired";

/** Everything a surface needs to describe tap-trading right now — derived, never asserted. */
export interface SessionView {
  status: SessionStatus;
  owner: Address | null;
  /** This browser's key for the owner, if it holds one. */
  keyAddress: Address | null;
  /** The owner's SESSION grant as the vault has it (live, expired or revoked-and-replaced), or null. */
  grant: VaultGrant | null;
  /** The Trading Balance's free amount (not in any grant). */
  availableBase: bigint | null;
  deployed: boolean;
  /** The current Trading Balance this view reads (v2 once deployed, S24.2): a position held elsewhere sells on its own vault. */
  vault: Address | null;
}

export const OFF: SessionView = { status: "no-wallet", owner: null, keyAddress: null, grant: null, availableBase: null, deployed: false, vault: null };

export function isGrantLive(grant: VaultGrant | null, nowSec: number): grant is VaultGrant {
  return grant !== null && !grant.revoked && grant.expiresAtSec >= nowSec;
}

export function deriveStatus(input: { owner: Address | null; passkey: boolean; snapshot: VaultSnapshot | null | undefined; keyLoaded: boolean; keyAddress: Address | null; nowSec: number }): SessionStatus {
  if (!input.owner) return "no-wallet";
  if (!input.passkey) return "not-passkey";
  if (input.snapshot === null) return "not-deployed";
  if (input.snapshot === undefined || !input.keyLoaded) return "loading";
  const grant = input.snapshot.grants.session;
  if (!grant || grant.revoked) return "disarmed";
  if (grant.expiresAtSec < input.nowSec) return "expired";
  if (!input.keyAddress || input.keyAddress.toLowerCase() !== grant.actor.toLowerCase()) return "grant-without-key";
  return "armed";
}
