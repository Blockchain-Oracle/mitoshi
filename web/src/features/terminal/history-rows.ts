// The Trade history's rows (R4-0, D-227): the wallet's indexed rounds and DEMO's paper trades in one row shape, so a
// signed-out History lists the paper trades this browser recorded, with the same stats and tags (Owarine 90a91d71
// `AccountSheet` `useHistoryRows`: the demo sheet lists paper history). Pure; amounts stay base units.
import type { LedgerSource, RoundOutcome, SettledRound } from "@cwf/core";
import type { PaperTrade } from "./demo";

/** DEMO's paper dollars carry 6 decimals, as pathUSD does. */
const PAPER_DECIMALS = 6;

export interface HistoryRow {
  key: string;
  /** Where it was held (D-227: the account's history): the wallet, the Trading Balance, a Boost, or DEMO paper. */
  source: LedgerSource | "paper";
  /** The Window, which finds the row's replay. */
  marketId: string;
  asset: string;
  up: boolean;
  outcome: RoundOutcome;
  intervalSec: number;
  stakeBase: bigint;
  pnlBase: bigint;
  decimals: number;
  settledAtMs: number | null;
  expirySec: number;
}

export function walletRows(rounds: readonly SettledRound[]): HistoryRow[] {
  return rounds.map((r) => ({
    key: `${r.source}:${r.marketId}:${r.openedAtMs}`, source: r.source, marketId: r.marketId, asset: r.asset, up: r.sidesTraded[0] !== 1, outcome: r.outcome, intervalSec: r.intervalSec,
    stakeBase: r.stakeBase, pnlBase: r.pnlBase, decimals: r.decimals, settledAtMs: r.settledAtMs, expirySec: r.expirySec,
  }));
}

/**
 * A paper close (or reduce, or trail) is "closed"; a settle is the Window's verdict — voided, else won when it paid at
 * least its cost (a winning side pays a dollar a contract, never under what it cost), else lost. The paper trade's id is
 * `<marketId>:<side>:<opened>:<closed>`, so the Window comes back out of it; the row's time is the Window's close, as a
 * wallet row's is (a trade recorded before it was stored falls back to when it closed).
 */
export function paperRows(trades: readonly PaperTrade[]): HistoryRow[] {
  return trades.map((t) => {
    const pnlBase = BigInt(t.pnlBase);
    const outcome: RoundOutcome = t.kind !== "settle" ? "closed" : t.voided ? "void" : pnlBase >= 0n ? "win" : "loss";
    return {
      key: t.id, source: "paper", marketId: t.id.split(":")[0] ?? t.id, asset: t.asset, up: t.side === "up", outcome, intervalSec: t.intervalSec,
      stakeBase: BigInt(t.costBase), pnlBase, decimals: PAPER_DECIMALS, settledAtMs: t.closedAtMs, expirySec: t.expirySec ?? Math.floor(t.closedAtMs / 1000),
    };
  });
}
