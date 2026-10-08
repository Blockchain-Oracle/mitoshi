/**
 * Whether an exit trigger may be stored (S24.3, `/api/exits`): well formed (`exitTriggerProblem`), on this chain's
 * current Trading Balance (v2 — the one with the EXIT grant), and signed by the actor of the owner's live SESSION grant
 * there. The session key is the one the owner armed on this device; a trigger it signs only says *when* to sell — the
 * sale itself runs under the owner's EXIT grant, at no less than the vault's fair-value floor (D-193).
 */
import { getAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";
import type { VaultGrant } from "@cwf/core";
import { exitTriggerProblem, exitTriggerTypedData, type ExitTrigger } from "@cwf/core/exits";
import { vaultDeploymentOf } from "../vault/read";

export type ExitVerdict = { ok: true; signer: Address } | { ok: false; status: 400 | 403; error: string };

export interface ExitVerifyDeps {
  chainId: number;
  nowMs: number;
  readGrant: (grantId: bigint, vault: Address) => Promise<VaultGrant | null>;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function verifyExitTrigger(t: ExitTrigger, signature: Hex, deps: ExitVerifyDeps): Promise<ExitVerdict> {
  const problem = exitTriggerProblem(t, deps.nowMs);
  if (problem) return { ok: false, status: 400, error: problem };
  if (t.chainId !== deps.chainId) return { ok: false, status: 400, error: `exits run on chain ${deps.chainId}` };
  const current = vaultDeploymentOf(deps.chainId);
  if (!current || current.version !== 2 || !same(current.eventVault, t.vault)) return { ok: false, status: 400, error: "exits run on the current Trading Balance" };
  let signer: Address;
  try {
    signer = getAddress(await recoverTypedDataAddress({ ...exitTriggerTypedData(t), signature }));
  } catch {
    return { ok: false, status: 400, error: "the signature does not read" };
  }
  const grant = await deps.readGrant(t.grantId, t.vault);
  if (!grant || !same(grant.owner, t.owner)) return { ok: false, status: 403, error: `grant #${t.grantId} is not this owner's` };
  if (grant.kind !== "session") return { ok: false, status: 403, error: `grant #${t.grantId} is not a Trading Balance session` };
  if (!same(grant.actor, signer)) return { ok: false, status: 403, error: "the signer is not this session's key" };
  if (grant.revoked) return { ok: false, status: 403, error: "the session was turned off" };
  if (grant.expiresAtSec * 1000 <= deps.nowMs) return { ok: false, status: 403, error: "the session has expired" };
  return { ok: true, signer };
}
