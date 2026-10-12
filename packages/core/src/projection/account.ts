/**
 * One account history (D-227): the wallet's own rounds, the Trading Balance's (the vault trades as itself, so none of its
 * fills are the wallet's) and the Boosts' (the reserve's), each a `SettledRound` tagged with its source, so the PnL card,
 * the history, the record curve and Trader Edge count every dollar once. Pure; every figure is base units.
 *   Trading Balance: P&L = proceeds + payout − cost, once the Window answered or nothing is held (sold out).
 *   Boost:           P&L = returned − stake, once it is no longer live (closed, knocked out or settled).
 */
import type { LeveragePosition } from "../leverage/types";
import type { OutcomeIdx } from "../types/market";
import type { VaultBet } from "../vault/types";
import { settleRound, roundSettledAtMs } from "./settle";
import type { MarketLedger, SettledRound } from "./types";

const NO_TX = "0x" as const;

/** A Trading Balance Window as a round: its tally replayed through the wallet's settlement rule (held = bought − sold). */
export function vaultRound(bet: VaultBet, nowSec: number): SettledRound | null {
  const heldUp = bet.boughtUpRaw - bet.soldUpRaw;
  const heldDown = bet.boughtDownRaw - bet.soldDownRaw;
  const answered = bet.state !== "open";
  const soldOut = heldUp + heldDown === 0n && bet.costBase > 0n;
  if (!answered && !soldOut) return null;
  const sides: OutcomeIdx[] = [...(bet.boughtUpRaw > 0n ? [0 as const] : []), ...(bet.boughtDownRaw > 0n ? [1 as const] : [])];
  const ledger: MarketLedger = {
    marketId: bet.marketId, heldUpRaw: heldUp, heldDownRaw: heldDown, costBase: bet.costBase, proceedsBase: bet.proceedsBase, openCostUpBase: bet.costUpBase, openCostDownBase: bet.costDownBase,
    sidesTraded: sides, fillCount: 0, shortCount: 0, firstAtMs: bet.firstAtSec * 1000, lastAtMs: bet.lastAtSec * 1000, entryTxHash: NO_TX, source: "vault",
  };
  // Sold out before the Window answered: the round closed on the book, at the last fill.
  const resolvedAtMs = answered ? bet.resolvedAtMs : bet.lastAtSec * 1000;
  const round = settleRound({
    ledger, feeBps: 0, liveHoldings: null, source: "vault",
    market: { marketId: bet.marketId, asset: bet.asset, intervalSec: bet.intervalSec, expirySec: bet.expirySec, decimals: bet.decimals, settled: true, voided: bet.state === "voided", winningOutcome: answered ? bet.winningOutcome : null, resolvedAtMs },
  });
  if (!round) return null;
  // The settler pays a vault Window into the Trading Balance itself (D-155): no claim, and none waiting once cranked.
  return { ...round, claim: round.payoutBase > 0n ? (bet.settledAtSec > 0 ? "paid" : "to-collect") : "none", settledAtMs: round.settledAtMs ?? (nowSec >= bet.expirySec ? bet.expirySec * 1000 : null) };
}

/** What a Boost's round needs from its Window: the asset and cadence, and its answer once there is one. */
export interface BoostWindow {
  asset: string;
  intervalSec: number;
  decimals: number;
  voided: boolean;
  winningOutcome: OutcomeIdx | null;
  resolvedAtMs: number | null;
}

/** A Boost no longer live as a round: it paid `returned` for `stake` (the reserve's front repaid first, never the owner's). */
export function boostRound(p: LeveragePosition, w: BoostWindow): SettledRound | null {
  if (p.status === "live") return null;
  const pnlBase = p.returnedBase - p.stakeBase;
  const side: OutcomeIdx = p.side === "up" ? 0 : 1;
  const outcome = p.status === "closed" ? "closed" : p.status === "knocked-out" ? "loss" : w.voided ? "void" : w.winningOutcome === side && pnlBase >= 0n ? "win" : "loss";
  const exitedAtMs = p.exitedAtSec === null ? null : p.exitedAtSec * 1000;
  return {
    marketId: p.marketId, asset: w.asset, intervalSec: w.intervalSec, expirySec: p.expirySec, decimals: w.decimals, outcome,
    legs: [], sidesTraded: [side], stakeBase: p.stakeBase, proceedsBase: p.status === "settled" ? 0n : p.returnedBase, payoutBase: p.status === "settled" ? p.returnedBase : 0n,
    feeBase: 0n, pnlBase, feeBps: 0, claim: "none", source: "boost", settledAtMs: exitedAtMs ?? w.resolvedAtMs, openedAtMs: p.openedAtSec * 1000, entryTxHash: NO_TX, fillCount: 0, shortCount: 0,
  };
}

/** Every source's rounds, newest first (the order the wallet history keeps). */
export function mergeRounds(...lists: readonly (readonly SettledRound[])[]): SettledRound[] {
  return lists.flat().sort((a, b) => roundSettledAtMs(b) - roundSettledAtMs(a));
}
