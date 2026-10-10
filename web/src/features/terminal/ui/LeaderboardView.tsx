"use client";
// Tradash's Leaderboard (RV-86) as the account drawer's view (D-190): ROI / PnL × Daily · Weekly · Monthly · All time,
// the podium and the board with your own row, on S5's data (`features/leaderboard`: `/api/leaderboard`, the same
// snapshot `/leaderboard` reads) and Tradash's five states. A row opens the wallet's profile (RV-86's drill-down).
import type { Address } from "@cwf/core";
import { useState } from "react";
import { LeaderboardPodium } from "@/components/ui/leaderboard-podium";
import { LeaderboardRankings, type RankingRow } from "@/components/ui/leaderboard-rankings";
import { LEADERBOARD as L } from "@/features/leaderboard/copy";
import type { BoardRow, BoardSort, Period } from "@/features/leaderboard/protocol";
import { useLeaderboard } from "@/features/leaderboard/useLeaderboard";
import { tapFeedback } from "@/lib/feedback";
import { money, moneyTone } from "../format";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function toRow(r: BoardRow, sort: BoardSort): RankingRow {
  const tone = (t: string) => (t === "is-up" ? "up" : t === "is-down" ? "down" : "flat") as RankingRow["tone"];
  const figure =
    sort === "roi"
      ? r.roiBps === null
        ? { figure: "—", tone: "flat" as const }
        : { figure: `${r.roiBps > 0 ? "+" : r.roiBps < 0 ? "−" : ""}${Math.abs(r.roiBps / 100).toFixed(1)}%`, tone: r.roiBps > 0 ? ("up" as const) : r.roiBps < 0 ? ("down" as const) : ("flat" as const) }
      : { figure: money(BigInt(r.pnlBase), true), tone: tone(moneyTone(BigInt(r.pnlBase))) };
  return { rank: r.rank, owner: r.owner, label: short(r.owner), byline: L.byline(r.tradeCount, r.settledTrades, r.winRatePct, r.bestStreak), href: `/u/${r.owner}`, ...figure };
}

function Tabs<V extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <div className="tm-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" className="tm-choice" aria-selected={value === o.value} onClick={() => (tapFeedback(), onChange(o.value))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LeaderboardView({ wallet }: { wallet: Address }) {
  // RV-86 puts ROI first; `/leaderboard` opens on P&L.
  const [sort, setSort] = useState<BoardSort>("roi");
  const [period, setPeriod] = useState<Period>("week");
  const board = useLeaderboard(period, sort, wallet);
  const rows = board.data?.rankings.map((r) => toRow(r, sort)) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Tabs label={L.sortLabel} options={[{ value: "roi", label: "ROI" }, { value: "pnl", label: "PnL" }] as const} value={sort} onChange={setSort} />
      <Tabs label={L.periodLabel} options={L.periods} value={period} onChange={setPeriod} />
      {board.isPending ? (
        <p role="status" className="tm-field-hint">{L.loading}</p>
      ) : board.isError && !board.data ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="tm-field-hint">{L.error}</p>
          <button type="button" className="tm-choice" onClick={() => void board.refetch()}>{L.retry}</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="tm-field-hint">{period === "all" ? L.empty : L.emptyPeriod}</p>
      ) : (
        <div className={`flex flex-col gap-4 ${board.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={board.isPlaceholderData}>
          <span className="tm-field-hint">{L.summary(board.data!.totalWallets, board.data!.closedCalls)}</span>
          <LeaderboardPodium label={L.podium} places={rows.slice(0, 3)} />
          <LeaderboardRankings label={L.list} rows={rows} you={board.data!.you ? toRow(board.data!.you, sort) : null} youOwner={wallet.toLowerCase()} youLabel={L.you} />
        </div>
      )}
    </div>
  );
}
