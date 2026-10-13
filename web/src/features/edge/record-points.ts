// The record curve's points (moved from features/markets/portfolio/RecordChart.tsx, R4-4, D-227: the 21st 29532 chart
// is drawn on Trader Edge only): realised P&L summed over every settled Window, in settlement order — the reading the
// history lists, so they can't disagree. Base units → dollars at the drawing boundary (integers until here).
import type { WalletHistory } from "@cwf/core";
import type { ValuePoint } from "@/components/ui/portfolio-chart";

export function recordPoints(history: WalletHistory): ValuePoint[] {
  const rounds = [...history.rounds].sort((a, b) => (a.settledAtMs ?? a.expirySec * 1000) - (b.settledAtMs ?? b.expirySec * 1000));
  let sum = 0n;
  return rounds.map((r) => {
    sum += r.pnlBase;
    return { tMs: r.settledAtMs ?? r.expirySec * 1000, value: Number(sum) / 10 ** r.decimals };
  });
}
