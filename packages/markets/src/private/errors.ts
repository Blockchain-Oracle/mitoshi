/** The desk's reverts in the one diagnosis vocabulary (AD-13; Masayume 68f7a09:packages/markets/src/private/errors.ts), named with their figures. */
import { decodeErrorResult, type Hex } from "viem";
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { privateDeskAbi } from "@cwf/clients/abis/PrivateDesk";
import { diagnose } from "../errors/error-map";
import { refusalText } from "../parlay/errors";

const KINDS: Record<string, DiagnosisKind> = {
  IsPaused: "market-not-trading",
  NotDesk: "contract-revert",
  NoBudget: "insufficient-collateral",
  OverAllowance: "spending-limit",
  Insufficient: "insufficient-collateral",
  PoolShort: "contract-revert",
  KeyUsed: "already-claimed",
  SlotAlreadyFunded: "already-claimed",
  StakeOutsideBand: "outside-band",
  StakeAboveMax: "requote",
  SlotAlreadyMinted: "already-claimed",
  SlotNotFunded: "not-settled",
  SlotEmpty: "already-claimed",
  NothingToSettle: "already-claimed",
  SlotHoldsContracts: "not-settled",
  UnknownMarket: "market-not-trading",
  MarketNotTrading: "market-not-trading",
  TooLate: "market-not-trading",
  BelowMinQuantity: "requote",
  NothingFilled: "requote",
  MarketNotSettled: "not-settled",
  ReceivePolicyBlocked: "receive-policy",
  EngineAccountingMismatch: "contract-revert",
  ERC20InsufficientAllowance: "insufficient-allowance",
  ERC20InsufficientBalance: "insufficient-collateral",
};

export function diagnosePrivate(error: unknown): Diagnosis {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const d = (e as { data?: unknown }).data;
    if (d && typeof d === "object" && typeof (d as { errorName?: unknown }).errorName === "string") {
      const x = d as { errorName: string; args?: unknown };
      return diagnosis(KINDS[x.errorName] ?? "contract-revert", refusalText(x.errorName, Array.isArray(x.args) ? x.args : []), { errorName: x.errorName });
    }
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) {
      try {
        const r = decodeErrorResult({ abi: privateDeskAbi, data: d as Hex });
        return diagnosis(KINDS[r.errorName] ?? "contract-revert", refusalText(r.errorName, (r.args ?? []) as readonly unknown[]), { errorName: r.errorName });
      } catch {
        /* not the desk's */
      }
    }
    e = (e as { cause?: unknown }).cause;
  }
  return diagnose(error);
}
