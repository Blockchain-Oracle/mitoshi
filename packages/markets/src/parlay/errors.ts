/**
 * The reserve's own reverts, and the guard's and verifier's that bubble through an open (PD-2), mapped into the one
 * diagnosis vocabulary (AD-13; Masayume 68f7a09:packages/markets/src/parlay/errors.ts). Reads and previews decode
 * with the combined ABI below, so a refusal arrives by name (`ThinBook(…)`, `BelowFairValue(…)`), never as hex.
 */
import { decodeErrorResult, type Abi, type Hex } from "viem";
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { parlayReserveAbi } from "@cwf/clients/abis/ParlayReserve";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { redStonePrintVerifierAbi } from "@cwf/clients/abis/RedStonePrintVerifier";
import { diagnose } from "../errors/error-map";

/** The reserve plus every error its open can surface from the guard and the RedStone verifier. */
export const PARLAY_READ_ABI = [
  ...parlayReserveAbi,
  ...fairValueGuardAbi.filter((e) => e.type === "error"),
  ...redStonePrintVerifierAbi.filter((e) => e.type === "error"),
] as const satisfies Abi;

const PARLAY_REVERT_KINDS: Record<string, DiagnosisKind> = {
  NotAdmin: "contract-revert",
  ZeroAddress: "contract-revert",
  ZeroAmount: "below-min-quantity",
  BadParams: "contract-revert",
  IsPaused: "market-not-trading",
  BadLegCount: "contract-revert",
  DuplicateMarket: "contract-revert",
  UnknownMarket: "market-not-trading",
  WrongCollateral: "contract-revert",
  BadOutcome: "contract-revert",
  MarketNotTrading: "market-not-trading",
  LegExpired: "market-not-trading",
  ThinBook: "thin-book",
  LongShot: "outside-band",
  OverPayoutCap: "reserve-cap",
  // The book moved between the quote and the open: the stake it now needs is above what was confirmed.
  StakeAboveMax: "requote",
  Underpriced: "outside-band",
  InsufficientLiquidity: "reserve-cap",
  OverExposure: "reserve-cap",
  OverExpiryCap: "reserve-cap",
  NoSuchParlay: "contract-revert",
  NoSuchLeg: "contract-revert",
  MarketNotSettled: "not-settled",
  NotWon: "already-claimed",
  InsufficientShares: "insufficient-collateral",
  // D-108: another leg settles first.
  LegOutOfOrder: "not-settled",
  // PD-2: the book prices a leg below the fair-value model by more than the slack.
  BelowFairValue: "outside-band",
  BadProofCount: "contract-revert",
  // The guard and the verifier (a same-call spot proof).
  SpotTooOld: "requote",
  RedStoneTimestampMismatch: "requote",
  SigmaNotSet: "market-not-trading",
  NoSpotSource: "market-not-trading",
  OpenPrintMissing: "market-not-trading",
  FeedIdMismatch: "contract-revert",
  InsufficientRedStoneSigners: "requote",
  NothingOwed: "already-claimed",
  ReceivePolicyBlocked: "receive-policy",
  ERC20InsufficientAllowance: "insufficient-allowance",
  ERC20InsufficientBalance: "insufficient-collateral",
};

/** The first revert data in an error's cause chain. */
function revertData(error: unknown): Hex | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) return data as Hex;
    const raw = (e as { raw?: unknown }).raw;
    if (typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10) return raw as Hex;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

function nameAndArgs(error: unknown): { name: string; args: readonly unknown[] } | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const d = (e as { data?: { errorName?: unknown; args?: unknown } }).data;
    if (d && typeof d === "object" && typeof d.errorName === "string") return { name: d.errorName, args: Array.isArray(d.args) ? d.args : [] };
    e = (e as { cause?: unknown }).cause;
  }
  const data = revertData(error);
  if (!data) return null;
  try {
    const decoded = decodeErrorResult({ abi: PARLAY_READ_ABI, data });
    return { name: decoded.errorName, args: (decoded.args ?? []) as readonly unknown[] };
  } catch {
    return null;
  }
}

/** `Name(arg, …)` with bigints and hex printed plainly: the form `parseRefusal` reads back. */
export function refusalText(name: string, args: readonly unknown[]): string {
  return `${name}(${args.map((a) => (typeof a === "bigint" ? a.toString() : String(a))).join(", ")})`;
}

export function diagnoseParlay(error: unknown): Diagnosis {
  const named = nameAndArgs(error);
  if (!named) return diagnose(error);
  return diagnosis(PARLAY_REVERT_KINDS[named.name] ?? "contract-revert", refusalText(named.name, named.args), { errorName: named.name });
}
