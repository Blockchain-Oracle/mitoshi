"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/history/{HistorySummary,useCsvDownload}.ts(x) (R4-4, D-227) — the
// record in one strip: net over every settled Window, the curve that produced it (the shared EquitySparkline), the win
// rate and the current run — then the same rounds as a CSV built in the browser at full precision (core `roundsToCsv`,
// L-49; it lived on Trader Edge). Nothing is computed twice: the strip reads the report Trader Edge reads.
import { roundsToCsv, type TraderEdge, type WalletHistory } from "@cwf/core";
import { Download } from "lucide-react";
import { useCallback } from "react";
import { EquitySparkline } from "@/components/data/EquitySparkline";
import { Masked, PillButton } from "@/components/kit";
import { money } from "@/features/terminal/format";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { HISTORY } from "../copy";

function useCsvDownload(history: WalletHistory, address: string) {
  return useCallback(() => {
    try {
      const url = URL.createObjectURL(new Blob([roundsToCsv(history.rounds)], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = HISTORY.csvName(address);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      notify.warning(HISTORY.csvFailed);
    }
  }, [history, address]);
}

export function HistorySummary({ history, edge, address }: { history: WalletHistory; edge: TraderEdge; address: string }) {
  const download = useCsvDownload(history, address);
  const S = HISTORY.summary;
  const net = money(edge.netBase, true, history.decimals);
  // The curve's spoken label names the net too: the dots in privacy mode, like the figure beside it.
  const hidden = usePrivacy();
  const curveLabel = hidden ? (direction: "up" | "down") => S.curveLabel(direction, SHELL.masked) : S.curveLabel;
  return (
    <div className="history-summary">
      <div className="history-summary-figure">
        <span className="type-label-micro text-ink-muted">{S.net}</span>
        <span className={cn("type-data-lg numbers", net === "$0.00" ? "text-ink" : edge.netBase > 0n ? "text-up" : "text-down")}><Masked>{net}</Masked></span>
        <span className="type-caption text-ink-secondary">{S.rounds(edge.settledRounds, edge.openRounds)}</span>
      </div>
      <EquitySparkline points={edge.equity} decimals={history.decimals} labels={{ empty: S.curveEmpty, curve: curveLabel }} className="history-summary-curve" />
      <dl className="history-summary-stats">
        <div>
          <dt className="type-label-micro text-ink-muted">{S.winRate}</dt>
          <dd className="type-data text-ink">{edge.winRatePct === null ? S.notYet : `${edge.winRatePct.toFixed(0)}%`}</dd>
        </div>
        <div>
          <dt className="type-label-micro text-ink-muted">{S.streak}</dt>
          <dd className="type-data text-ink">{edge.currentWinStreak} {S.streakUnit(edge.currentWinStreak)}</dd>
        </div>
      </dl>
      <PillButton tone="white" size="sm" className="history-summary-csv" onClick={download} disabled={history.rounds.length === 0}>
        <Download aria-hidden /> {HISTORY.csv}
      </PillButton>
    </div>
  );
}
