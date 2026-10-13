/**
 * The arena's reverts in the one diagnosis vocabulary (AD-13; R4-9, D-227; Masayume 68f7a09:packages/markets/src/games/
 * errors.ts), named with their figures. The lifecycle refusals land on `contract-revert` on purpose: a duel surface says
 * what happened ("this card is already played", "the deadline passed") from the decoded name, not a generic bucket.
 */
import { decodeErrorResult, type Hex } from "viem";
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { gameArenaAbi } from "@cwf/clients/abis/GameArena";
import { diagnose } from "../errors/error-map";
import { refusalText } from "../parlay/errors";

const KINDS: Record<string, DiagnosisKind> = {
  NotAdmin: "contract-revert",
  ZeroAddress: "contract-revert",
  ZeroAmount: "below-min-quantity",
  BadParams: "contract-revert",
  IsPaused: "market-not-trading",
  UnknownMarket: "market-not-trading",
  WrongCollateral: "contract-revert",
  WrongLens: "contract-revert",
  BadOutcome: "contract-revert",
  MarketNotTrading: "market-not-trading",
  MarketNotSettled: "not-settled",
  TooLate: "market-not-trading",
  BelowMinQuantity: "below-min-quantity",
  // The book moved between the walk and the fill: what it cost is above the cap this card was given.
  CostAboveStake: "requote",
  StakeAboveCap: "outside-band",
  MatchExists: "contract-revert",
  NoSuchMatch: "contract-revert",
  WrongStatus: "contract-revert",
  UnknownTier: "contract-revert",
  BadDeckSize: "contract-revert",
  DuplicateCard: "contract-revert",
  DeckMismatch: "contract-revert",
  NotAPlayer: "contract-revert",
  SelfJoin: "contract-revert",
  DeadlinePassed: "contract-revert",
  DeadlineNotPassed: "contract-revert",
  BadCard: "contract-revert",
  AlreadyPicked: "contract-revert",
  NotPicked: "contract-revert",
  AlreadySettled: "already-claimed",
  CardsOutstanding: "not-settled",
  NoCredit: "already-claimed",
  Overflow: "contract-revert",
  NotAgent: "signer-required",
  AgentExpired: "signer-required",
  AgentOverBudget: "contract-revert",
  BadTtl: "contract-revert",
  EngineAccountingMismatch: "contract-revert",
  ERC20InsufficientAllowance: "insufficient-allowance",
  ERC20InsufficientBalance: "insufficient-collateral",
};

export function diagnoseArena(error: unknown): Diagnosis {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const d = (e as { data?: unknown }).data;
    if (d && typeof d === "object" && typeof (d as { errorName?: unknown }).errorName === "string") {
      const x = d as { errorName: string; args?: unknown };
      return diagnosis(KINDS[x.errorName] ?? "contract-revert", refusalText(x.errorName, Array.isArray(x.args) ? x.args : []), { errorName: x.errorName });
    }
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) {
      try {
        const r = decodeErrorResult({ abi: gameArenaAbi, data: d as Hex });
        return diagnosis(KINDS[r.errorName] ?? "contract-revert", refusalText(r.errorName, (r.args ?? []) as readonly unknown[]), { errorName: r.errorName });
      } catch {
        /* not the arena's */
      }
    }
    e = (e as { cause?: unknown }).cause;
  }
  return diagnose(error);
}
