// Ported from Masayume 68f7a09:packages/markets/src/private/claim.ts — unchanged but for the brand of the EIP-712 domain name.
import { PRIVATE_CLAIM_DOMAIN_NAME, PRIVATE_CLAIM_DOMAIN_VERSION, PRIVATE_CLAIM_TYPES, type PrivateClaim } from "@cwf/core/private";
import type { Address, Hex } from "@cwf/core";
import { verifyTypedData, type WalletClient } from "viem";

export interface ClaimDomain {
  name: typeof PRIVATE_CLAIM_DOMAIN_NAME;
  version: typeof PRIVATE_CLAIM_DOMAIN_VERSION;
  chainId: number;
  verifyingContract: Address;
}

/** The EIP-712 domain is the desk CONTRACT, so a claim signed for one deployment never verifies against another. */
export function claimDomain(chainId: number, contract: Address): ClaimDomain {
  return { name: PRIVATE_CLAIM_DOMAIN_NAME, version: PRIVATE_CLAIM_DOMAIN_VERSION, chainId, verifyingContract: contract };
}

/** Addresses hash the same in any case; lower-casing here means a claim that travelled through JSON in mixed case still verifies. */
function claimMessage(claim: PrivateClaim) {
  return {
    owner: claim.owner.toLowerCase() as Address,
    slotId: claim.slotId,
    creditKey: claim.creditKey,
    marketId: claim.marketId as `0x${string}`,
    outcomeIdx: claim.outcomeIdx,
    stake: BigInt(claim.stakeBase),
    issuedAtMs: BigInt(claim.issuedAtMs),
  } as const;
}

/** The desk's signature over a claim — the only proof the position is the owner's. */
export async function signPrivateClaim(walletClient: WalletClient, domain: ClaimDomain, claim: PrivateClaim): Promise<Hex> {
  const account = walletClient.account;
  if (!account) throw new Error("the desk's wallet client has no account bound");
  return walletClient.signTypedData({ account, domain, types: PRIVATE_CLAIM_TYPES, primaryType: "Claim", message: claimMessage(claim) });
}

/** Runs anywhere — the browser checks a claim against the key the contract pins, never against the desk's word. */
export async function verifyPrivateClaim(domain: ClaimDomain, claim: PrivateClaim, signature: Hex, desk: Address): Promise<boolean> {
  try {
    return await verifyTypedData({ address: desk, domain, types: PRIVATE_CLAIM_TYPES, primaryType: "Claim", message: claimMessage(claim), signature });
  } catch {
    return false;
  }
}
