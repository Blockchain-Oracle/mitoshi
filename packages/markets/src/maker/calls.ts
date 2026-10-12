/**
 * Earn maker vault intents → calls for the one tx lane (S8 box 2; Masayume 68f7a09:packages/markets/src/maker/write.ts
 * rebuilt as `vault/calls.ts` is): `supply` is capital intake — root-signed, never sponsored, its exact
 * `pathUSD.approve(vault, amount)` in the same atomic batch (D-020/D-029); `withdraw` pays `msg.sender` only and the
 * permissionless `pull` / `merge` / `settle` move only the vault's own money, so the relay's `maker` policy sponsors them
 * (D-118). `quote` is the maker key's and pays its own fee.
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";
import { diagnosis, formatBaseUnits, USD_DECIMALS, type TxIntent } from "@cwf/core";
import type { MakerIntent } from "@cwf/core/maker";
import { PATH_USD } from "../path-usd";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { approveCall, type Call } from "../tx/batch";
import { makerVenueOf } from "./deployment";

const vaultCall = (vault: Address, functionName: string, args: readonly unknown[]): Call => ({
  to: vault,
  data: encodeFunctionData({ abi: marketMakerVaultAbi, functionName: functionName as never, args: args as never }),
});

/** The journal's one line, for the person who reads it back after a timeout. */
export function summarizeMaker(intent: MakerIntent, decimals = USD_DECIMALS): string {
  const amount = (base: bigint) => `$${formatBaseUnits(base, decimals, { minDp: 2, maxDp: 2 })}`;
  switch (intent.kind) {
    case "maker-supply":
      return `supply ${amount(intent.amountBase)} to the maker vault`;
    case "maker-withdraw":
      return `redeem ${formatBaseUnits(intent.shares, decimals, { minDp: 2, maxDp: 2 })} maker vault shares`;
    case "maker-quote":
      return `quote ${intent.marketId.slice(0, 10)} ${intent.bidYesRaw}/${intent.askYesRaw} × ${intent.quantityRaw}`;
    case "maker-pull":
      return `pull the vault's quotes on ${intent.marketId.slice(0, 10)}`;
    case "maker-merge":
      return `merge the vault's pairs on ${intent.marketId.slice(0, 10)}`;
    case "maker-settle":
      return `settle the vault on ${intent.marketId.slice(0, 10)}`;
  }
}

function callsOf(vault: Address, intent: MakerIntent): { calls: Call[]; sponsored: boolean } {
  switch (intent.kind) {
    case "maker-supply":
      return { calls: [approveCall(PATH_USD, vault, intent.amountBase), vaultCall(vault, "supply", [intent.amountBase])], sponsored: false };
    case "maker-withdraw":
      return { calls: [vaultCall(vault, "withdraw", [intent.shares])], sponsored: true };
    case "maker-quote":
      return { calls: [vaultCall(vault, "quote", [intent.marketId as Hex, intent.bidYesRaw, intent.askYesRaw, intent.quantityRaw, intent.expireNs])], sponsored: false };
    case "maker-pull":
      return { calls: [vaultCall(vault, "pull", [intent.marketId as Hex])], sponsored: true };
    case "maker-merge":
      return { calls: [vaultCall(vault, "merge", [intent.marketId as Hex])], sponsored: true };
    case "maker-settle":
      return { calls: [vaultCall(vault, "settle", [intent.marketId as Hex])], sponsored: true };
  }
}

const isMaker = (intent: TxIntent): intent is MakerIntent => intent.kind.startsWith("maker-");

/** The maker vault's encoder for the tx lane (`submitter/encoders.ts`): claims every `maker-*` intent. */
export function encodeMakerIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!isMaker(intent)) return null;
  const deployment = makerVenueOf(ctx.chainId);
  if (!deployment) return { ok: false, diagnosis: diagnosis("not-deployed", `MarketMakerVault is not deployed on chain ${ctx.chainId}`) };
  if (intent.kind === "maker-supply" && intent.amountBase <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "the amount must be above zero", { errorName: "ZeroAmount" }) };
  if (intent.kind === "maker-withdraw" && intent.shares <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "nothing to withdraw", { errorName: "ZeroAmount" }) };
  const { calls, sponsored } = callsOf(deployment.marketMakerVault, intent);
  return { ok: true, value: { area: "maker", calls, sponsored, summary: summarizeMaker(intent) } };
}
