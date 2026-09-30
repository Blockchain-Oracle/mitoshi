// Ported from Masayume 68f7a09:packages/markets/src/vault/write.ts (`sendVaultIntent`, `summarizeVault`) — rebuilt as
// intent → calls for the one tx lane: no simulate-then-write, no forwarder, no max allowance (an exact approve rides
// in the same atomic batch as the deposit, one signature), and sponsorship is the relay's vault policy (D-003).
/**
 * EventVault intents (plan C.2.3 vault rows):
 * - capital intake and delegation setup — `deposit`, `depositAndGrant`, `grant`, `fundGrant` (and deposit + fund in one
 *   batch, "Add to budget") — are root-signed and
 *   **never sponsored** (the relay's `never` list refuses them anyway): the owner pays for money moving in and for
 *   arming a key; each carries its exact `pathUSD.approve(vault, amount)` in the same transaction;
 * - exits and housekeeping — `withdraw`, `withdrawPrivate`, `revoke`, `crankSettle`, `sweep` — are one call, sponsored
 *   (they pay `msg.sender` only or move nobody's money);
 * - `moveToPrivate` is not sponsored (Q-021 default, Masayume's list).
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { diagnosis, formatBaseUnits, GRANT_KIND_INDEX, USD_DECIMALS, type GrantTerms, type TxIntent, type VaultIntent } from "@cwf/core";
import { approveCall, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { capsTuple, vaultDeploymentOf } from "./read";

const vaultCall = (vault: Address, functionName: string, args: readonly unknown[]): Call => ({
  to: vault,
  data: encodeFunctionData({ abi: eventVaultAbi, functionName: functionName as never, args: args as never }),
});

const grantArgs = (t: GrantTerms) => [GRANT_KIND_INDEX[t.kind], t.actor, capsTuple(t.caps), BigInt(t.expiresAtSec), t.budgetBase] as const;

/** `placeFor(grantId, marketId, outcomeIdx, isBuy, priceRaw, quantityRaw, expireNs)`: the session key's tap. */
export function placeForCall(vault: Address, a: { grantId: bigint; marketId: Hex; outcomeIdx: 0 | 1; isBuy: boolean; priceRaw: bigint; quantityRaw: bigint; expireNs: bigint }): Call {
  return vaultCall(vault, "placeFor", [a.grantId, a.marketId, a.outcomeIdx, a.isBuy, a.priceRaw, a.quantityRaw, a.expireNs]);
}

/** `place(marketId, outcomeIdx, isBuy, priceRaw, quantityRaw, expireNs)`: the owner trading from their own balance. */
export function placeCall(vault: Address, a: { marketId: Hex; outcomeIdx: 0 | 1; isBuy: boolean; priceRaw: bigint; quantityRaw: bigint; expireNs: bigint }): Call {
  return vaultCall(vault, "place", [a.marketId, a.outcomeIdx, a.isBuy, a.priceRaw, a.quantityRaw, a.expireNs]);
}

export const crankSettleCall = (vault: Address, owner: Address, marketId: Hex): Call => vaultCall(vault, "crankSettle", [owner, marketId]);

/** The journal's one line, written for the person who reads it back after a timeout. */
export function summarizeVault(intent: VaultIntent, decimals = USD_DECIMALS): string {
  const amount = (base: bigint) => `$${formatBaseUnits(base, decimals, { minDp: 2, maxDp: 2 })}`;
  switch (intent.kind) {
    case "vault-deposit":
      return `deposit ${amount(intent.amountBase)} into the Trading Balance`;
    case "vault-withdraw":
      return `withdraw ${amount(intent.amountBase)} from the Trading Balance`;
    case "vault-move-private":
      return `move ${amount(intent.amountBase)} to the private balance`;
    case "vault-withdraw-private":
      return `withdraw ${amount(intent.amountBase)} from the private balance`;
    case "vault-grant":
      return `arm tap-trading with a ${amount(intent.terms.budgetBase)} budget`;
    case "vault-deposit-and-grant":
      return `add ${amount(intent.amountBase)} and arm tap-trading with a ${amount(intent.terms.budgetBase)} budget`;
    case "vault-fund-grant":
      return `add ${amount(intent.amountBase)} to the tap-trading budget`;
    case "vault-deposit-and-fund":
      return `add ${amount(intent.amountBase)} from your wallet to the tap-trading budget`;
    case "vault-revoke":
      return `stop tap-trading grant #${intent.grantId}`;
    case "vault-crank-settle":
      return `settle ${intent.marketId.slice(0, 10)} into the Trading Balance`;
    case "vault-sweep":
      return `sweep the vault's engine credit on ${intent.marketId.slice(0, 10)}`;
  }
}

function callsOf(vault: Address, collateral: Address, intent: VaultIntent): { calls: Call[]; sponsored: boolean } {
  switch (intent.kind) {
    case "vault-deposit":
      return { calls: [approveCall(collateral, vault, intent.amountBase), vaultCall(vault, "deposit", [intent.amountBase])], sponsored: false };
    case "vault-deposit-and-grant":
      return { calls: [approveCall(collateral, vault, intent.amountBase), vaultCall(vault, "depositAndGrant", [intent.amountBase, ...grantArgs(intent.terms)])], sponsored: false };
    case "vault-grant":
      return { calls: [vaultCall(vault, "grant", grantArgs(intent.terms))], sponsored: false };
    case "vault-fund-grant":
      return { calls: [vaultCall(vault, "fundGrant", [intent.grantId, intent.amountBase])], sponsored: false };
    case "vault-deposit-and-fund":
      return {
        calls: [approveCall(collateral, vault, intent.amountBase), vaultCall(vault, "deposit", [intent.amountBase]), vaultCall(vault, "fundGrant", [intent.grantId, intent.amountBase])],
        sponsored: false,
      };
    case "vault-move-private":
      return { calls: [vaultCall(vault, "moveToPrivate", [intent.amountBase])], sponsored: false };
    case "vault-withdraw":
      return { calls: [vaultCall(vault, "withdraw", [intent.amountBase])], sponsored: true };
    case "vault-withdraw-private":
      return { calls: [vaultCall(vault, "withdrawPrivate", [intent.amountBase])], sponsored: true };
    case "vault-revoke":
      return { calls: [vaultCall(vault, "revoke", [intent.grantId])], sponsored: true };
    case "vault-crank-settle":
      return { calls: [crankSettleCall(vault, intent.owner, intent.marketId)], sponsored: true };
    case "vault-sweep":
      return { calls: [vaultCall(vault, "sweep", [intent.marketId])], sponsored: true };
  }
}

const isVault = (intent: TxIntent): intent is VaultIntent => intent.kind.startsWith("vault-");

/** The vault's encoder for the tx lane (`submitter/encoders.ts`): claims every `vault-*` intent. */
export function encodeVaultIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!isVault(intent)) return null;
  const deployment = vaultDeploymentOf(ctx.chainId);
  if (!deployment) return { ok: false, diagnosis: diagnosis("not-deployed", `EventVault is not deployed on chain ${ctx.chainId}`) };
  if ("amountBase" in intent && intent.amountBase <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "the amount must be above zero", { errorName: "ZeroAmount" }) };
  const { calls, sponsored } = callsOf(deployment.eventVault, deployment.collateral, intent);
  return { ok: true, value: { area: "vault", calls, sponsored, summary: summarizeVault(intent) } };
}
