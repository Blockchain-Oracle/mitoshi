/**
 * The leverage reserve's reverts, and the guard's/verifier's that bubble through an open or a knock-out (PD-2), in the
 * one diagnosis vocabulary (AD-13; Masayume 68f7a09:packages/markets/src/leverage/errors.ts), named with their figures.
 */
import { decodeErrorResult, type Abi, type Hex } from "viem";
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { redStonePrintVerifierAbi } from "@cwf/clients/abis/RedStonePrintVerifier";
import { diagnose } from "../errors/error-map";
import { refusalText } from "../parlay/errors";

export const LEVERAGE_READ_ABI = [...leverageReserveAbi, ...fairValueGuardAbi.filter((e) => e.type === "error"), ...redStonePrintVerifierAbi.filter((e) => e.type === "error")] as const satisfies Abi;

const KINDS: Record<string, DiagnosisKind> = {
  IsPaused: "market-not-trading",
  UnknownMarket: "market-not-trading",
  BadOutcome: "contract-revert",
  MarketNotTrading: "market-not-trading",
  TooLate: "market-not-trading",
  BadLeverage: "contract-revert",
  ThinBook: "thin-book",
  OutsideBand: "outside-band",
  BelowMinQuantity: "below-min-quantity",
  StakeAboveMax: "requote",
  Underpriced: "outside-band",
  // D-116: a void pays half; the front must be repaid out of it.
  VoidWouldShort: "outside-band",
  // D-114: at birth the exit walk over rested depth must take the whole size above the line.
  UnhealthyAtEntry: "thin-book",
  // PD-2: the entry price is above the fair-value model by more than the slack.
  AboveFairValue: "outside-band",
  OverPositionCap: "reserve-cap",
  OverWindowCap: "reserve-cap",
  OverExposure: "reserve-cap",
  TooManyOpen: "reserve-cap",
  InsufficientLiquidity: "reserve-cap",
  InsufficientShares: "insufficient-collateral",
  NothingFilled: "requote",
  NoSuchPosition: "contract-revert",
  NotOwner: "contract-revert",
  NotLive: "already-claimed",
  StillHealthy: "not-settled",
  FairValueHealthy: "not-settled",
  Slippage: "requote",
  MarketNotSettled: "not-settled",
  UnsettledPosition: "not-settled",
  NothingOwed: "already-claimed",
  ReceivePolicyBlocked: "receive-policy",
  EngineAccountingMismatch: "contract-revert",
  SpotTooOld: "requote",
  RedStoneTimestampMismatch: "requote",
  InsufficientRedStoneSigners: "requote",
  SigmaNotSet: "market-not-trading",
  NoSpotSource: "market-not-trading",
  OpenPrintMissing: "market-not-trading",
  ERC20InsufficientAllowance: "insufficient-allowance",
  ERC20InsufficientBalance: "insufficient-collateral",
};

function named(error: unknown): { name: string; args: readonly unknown[] } | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const d = (e as { data?: unknown }).data;
    if (d && typeof d === "object" && typeof (d as { errorName?: unknown }).errorName === "string") {
      const x = d as { errorName: string; args?: unknown };
      return { name: x.errorName, args: Array.isArray(x.args) ? x.args : [] };
    }
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) {
      try {
        const r = decodeErrorResult({ abi: LEVERAGE_READ_ABI, data: d as Hex });
        return { name: r.errorName, args: (r.args ?? []) as readonly unknown[] };
      } catch {
        /* not ours */
      }
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

export function diagnoseLeverage(error: unknown): Diagnosis {
  const n = named(error);
  if (!n) return diagnose(error);
  return diagnosis(KINDS[n.name] ?? "contract-revert", refusalText(n.name, n.args), { errorName: n.name });
}
