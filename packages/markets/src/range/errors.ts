/**
 * The range reserve's reverts, and the guard's and verifier's that bubble through an open (PD-2/D-119), mapped into the
 * one diagnosis vocabulary (AD-13; Masayume 68f7a09:packages/markets/src/range/errors.ts). Names and arguments come
 * back as `Name(arg, …)` in `technical`, the parlay's form, so a ticket can name the band's refusal on its own line.
 */
import { decodeErrorResult, type Abi, type Hex } from "viem";
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { redStonePrintVerifierAbi } from "@cwf/clients/abis/RedStonePrintVerifier";
import { diagnose } from "../errors/error-map";
import { refusalText } from "../parlay/errors";

export const RANGE_READ_ABI = [
  ...rangeReserveAbi,
  ...fairValueGuardAbi.filter((e) => e.type === "error"),
  ...redStonePrintVerifierAbi.filter((e) => e.type === "error"),
] as const satisfies Abi;

const RANGE_REVERT_KINDS: Record<string, DiagnosisKind> = {
  NotAdmin: "contract-revert",
  ZeroAddress: "contract-revert",
  ZeroAmount: "below-min-quantity",
  BadParams: "contract-revert",
  IsPaused: "market-not-trading",
  UnknownMarket: "market-not-trading",
  WrongCollateral: "contract-revert",
  WrongAsset: "contract-revert",
  NoTicker: "market-not-trading",
  NoOpeningPrint: "not-settled",
  NoVolatility: "market-not-trading",
  MarketNotTrading: "market-not-trading",
  TooLate: "market-not-trading",
  TooFar: "market-not-trading",
  BadBand: "outside-band",
  ThinBook: "thin-book",
  WideBook: "thin-book",
  WindowDecided: "outside-band",
  // PD-2/D-119: the book's centre sits more than 2σ from the signed spot — the market moved and the book hasn't.
  StaleBasis: "outside-band",
  LongShot: "outside-band",
  NearCertain: "outside-band",
  OverPayoutCap: "reserve-cap",
  StakeAboveMax: "requote",
  Underpriced: "outside-band",
  InsufficientLiquidity: "reserve-cap",
  OverExposure: "reserve-cap",
  OverExpiryCap: "reserve-cap",
  NoSuchRound: "contract-revert",
  NotSettled: "not-settled",
  NotStale: "not-settled",
  MustSettle: "not-settled",
  NotWon: "already-claimed",
  InsufficientShares: "insufficient-collateral",
  NothingOwed: "already-claimed",
  ReceivePolicyBlocked: "receive-policy",
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
        const r = decodeErrorResult({ abi: RANGE_READ_ABI, data: d as Hex });
        return { name: r.errorName, args: (r.args ?? []) as readonly unknown[] };
      } catch {
        /* not ours */
      }
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

export function diagnoseRange(error: unknown): Diagnosis {
  const n = named(error);
  if (!n) return diagnose(error);
  return diagnosis(RANGE_REVERT_KINDS[n.name] ?? "contract-revert", refusalText(n.name, n.args), { errorName: n.name });
}
