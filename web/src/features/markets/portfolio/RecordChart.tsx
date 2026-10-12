"use client";
/**
 * Your record as a curve (21st 29532 via `components/ui/portfolio-chart`): realised P&L summed over every settled Window
 * of the fills projection, in settlement order — the same reading the history journal lists, so they can't disagree.
 * D-227: that reading is the account's (`useAccountHistory`: wallet, Trading Balance and Boost rounds).
 */
import type { Reading, WalletHistory } from "@cwf/core";
import { isOk } from "@cwf/core";
import { PortfolioChart, type ValuePoint } from "@/components/ui/portfolio-chart";
import { RECORD_CHART } from "../copy";
import "@/styles/chart-engine.css";

export function recordPoints(history: WalletHistory): ValuePoint[] {
  const rounds = [...history.rounds].sort((a, b) => (a.settledAtMs ?? a.expirySec * 1000) - (b.settledAtMs ?? b.expirySec * 1000));
  let sum = 0n;
  return rounds.map((r) => {
    sum += r.pnlBase;
    // Base units → dollars at the drawing boundary (integers until here).
    return { tMs: r.settledAtMs ?? r.expirySec * 1000, value: Number(sum) / 10 ** r.decimals };
  });
}

export function RecordChart({ history, onRetry }: { history: Reading<WalletHistory> | null; onRetry: () => void }) {
  const status = history === null ? "loading" : !isOk(history) ? "error" : "ready";
  return <PortfolioChart points={history && isOk(history) ? recordPoints(history.value) : []} status={status} labels={RECORD_CHART} onRetry={onRetry} className="bets-plate p-4" />;
}
