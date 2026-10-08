/**
 * Whether an exit trigger may be stored (S24.3, `/api/exits`, D-209): well formed (`exitTriggerProblem`), on this
 * chain's current Trading Balance (v2 — the one with the EXIT grant), and signed by the actor of the owner's live
 * SESSION grant there. The session key is the browser's WebCrypto P-256 key, so the signature is a Tempo envelope, not
 * an ECDSA one: it is checked against the grant's actor with viem's Tempo `verifyHash` (P-256, WebAuthn, keychain and
 * secp256k1 alike), never recovered. A trigger only says *when* to sell — the sale itself runs under the owner's EXIT
 * grant, at no less than the vault's fair-value floor (D-193).
 */
import { createPublicClient, hashTypedData, type Address, type Hex, type Transport } from "viem";
import { verifyHash } from "viem/actions";
import type { Network, VaultGrant } from "@cwf/core";
import { exitTriggerProblem, exitTriggerTypedData, type ExitTrigger } from "@cwf/core/exits";
import { tempoChain } from "../chains";
import { vaultDeploymentOf } from "../vault/read";

export type ExitVerdict = { ok: true; signer: Address } | { ok: false; status: 400 | 403; error: string };

export interface ExitVerifyDeps {
  chainId: number;
  nowMs: number;
  readGrant: (grantId: bigint, vault: Address) => Promise<VaultGrant | null>;
  /** Whether `signature` is `address`'s over `hash` (`exitSignatureCheck`). */
  verify: (address: Address, hash: Hex, signature: Hex) => Promise<boolean>;
}

/**
 * The production signature check: viem's `verifyHash` hands a chain's own `verifyHash` the envelope, and only the full
 * Tempo chain (`tempoChain`) carries it — the read runtime's plain `tempoReadChain` would fall through to ecrecover and
 * refuse every P-256 signature (the live check, 2026-10-08). So the client is built here, on that chain, never passed
 * in. The chain is asked only for the signer's code.
 */
export function exitSignatureCheck(input: { network: Network; transport: Transport }) {
  const client = createPublicClient({ chain: tempoChain(input.network), transport: input.transport });
  return (address: Address, hash: Hex, signature: Hex): Promise<boolean> => verifyHash(client, { address, hash, signature }).catch(() => false);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function verifyExitTrigger(t: ExitTrigger, signature: Hex, deps: ExitVerifyDeps): Promise<ExitVerdict> {
  const problem = exitTriggerProblem(t, deps.nowMs);
  if (problem) return { ok: false, status: 400, error: problem };
  if (t.chainId !== deps.chainId) return { ok: false, status: 400, error: `exits run on chain ${deps.chainId}` };
  const current = vaultDeploymentOf(deps.chainId);
  if (!current || current.version !== 2 || !same(current.eventVault, t.vault)) return { ok: false, status: 400, error: "exits run on the current Trading Balance" };
  let hash: Hex;
  try {
    hash = hashTypedData(exitTriggerTypedData(t));
  } catch {
    return { ok: false, status: 400, error: "the trigger does not hash (an address or id is malformed)" };
  }
  const grant = await deps.readGrant(t.grantId, t.vault);
  if (!grant || !same(grant.owner, t.owner)) return { ok: false, status: 403, error: `grant #${t.grantId} is not this owner's` };
  if (grant.kind !== "session") return { ok: false, status: 403, error: `grant #${t.grantId} is not a Trading Balance session` };
  if (grant.revoked) return { ok: false, status: 403, error: "the session was turned off" };
  if (grant.expiresAtSec * 1000 <= deps.nowMs) return { ok: false, status: 403, error: "the session has expired" };
  if (!(await deps.verify(grant.actor, hash, signature))) return { ok: false, status: 403, error: "the signer is not this session's key" };
  return { ok: true, signer: grant.actor };
}
