// Ported from Masayume 68f7a09:packages/markets/src/vault/errors.ts — `NoDepositViaForwarder` gone with the forwarder
// (D-003); `OutsideGrantMarket` (D-091), `OffGrid`, `EngineAccountingMismatch` and `ReceivePolicyBlocked` (P12, D-112)
// added; the engine's own refusals surface through the vault's call and are named by the engine decoder.
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { diagnoseWrite } from "../submitter/diagnose-write";
import { revertKind } from "../errors/error-map";

/** The vault's own reverts (`IEventVault` errors), mapped into the one diagnosis vocabulary (AD-13). */
export const VAULT_REVERT_KINDS: Record<string, DiagnosisKind> = {
  ZeroAmount: "below-min-quantity",
  Insufficient: "insufficient-collateral",
  UnknownMarket: "market-not-trading",
  WrongCollateral: "contract-revert",
  WrongLens: "contract-revert",
  MarketNotTrading: "market-not-trading",
  MarketNotSettled: "not-settled",
  NothingToSettle: "already-claimed",
  BadOutcome: "contract-revert",
  OffGrid: "invalid-price",
  EngineAccountingMismatch: "contract-revert",
  NoSuchGrant: "grant-refused",
  NotGrantActor: "grant-refused",
  NotGrantOwner: "grant-refused",
  GrantIsRevoked: "grant-refused",
  GrantExpired: "grant-refused",
  BadExpiry: "grant-refused",
  ZeroActor: "grant-refused",
  OverStakeCap: "grant-refused",
  OverDailyCap: "grant-refused",
  OverPriceCap: "grant-refused",
  OverPositionCap: "grant-refused",
  OutsideGrantMarket: "grant-refused",
  ReceivePolicyBlocked: "receive-policy",
};

/** The vault error name in a revert's data or message (viem's decoded name first, then raw data), or null. */
export function vaultErrorName(error: unknown): string | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e; depth++) {
    if (e instanceof ContractFunctionRevertedError && e.data?.errorName && e.data.errorName in VAULT_REVERT_KINDS) return e.data.errorName;
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
      try {
        return decodeErrorResult({ abi: eventVaultAbi, data: data as Hex }).errorName;
      } catch {
        /* not a vault error */
      }
    }
    e = (e as { cause?: unknown }).cause;
  }
  const text = error instanceof BaseError ? `${error.shortMessage} ${error.details}` : String(error);
  for (const hex of text.match(/0x[0-9a-fA-F]{8,}/g) ?? []) {
    try {
      return decodeErrorResult({ abi: eventVaultAbi, data: hex as Hex }).errorName;
    } catch {
      /* not a vault error */
    }
  }
  return null;
}

/** A vault write's failure in the one vocabulary: the vault's own error by name, else the engine's, else the map's. */
export function diagnoseVault(error: unknown): Diagnosis {
  const name = vaultErrorName(error);
  if (name) {
    const base = diagnoseWrite(error);
    return diagnosis(VAULT_REVERT_KINDS[name] ?? revertKind(name) ?? "contract-revert", base.technical, { errorName: name });
  }
  return diagnoseWrite(error);
}
