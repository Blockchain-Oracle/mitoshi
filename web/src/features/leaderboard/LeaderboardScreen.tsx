"use client";
// `/leaderboard` (S5, L-48, RV-86): Masayume 68f7a09 `features/leaderboard/LeaderboardScreen.tsx`'s order — the
// podium, the board and the reader's own row — over the index's settled rounds, with Tradash's P&L / ROI and
// Daily · Weekly · Monthly · All time tabs (23552 segmented controls) and its five states. Rows open the wallet on the
// explorer until S13's profile (`/u/[address]`) exists.
import { addressUrl, type Address } from "@cwf/core";
import { useState } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { LeaderboardPodium } from "@/components/ui/leaderboard-podium";
import { LeaderboardRankings, type RankingRow } from "@/components/ui/leaderboard-rankings";
import { MotionScope } from "@/components/motion-scope";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { money, moneyTone } from "@/features/terminal/format";
import { LEADERBOARD as L } from "./copy";
import type { BoardRow, BoardSort, Period } from "./protocol";
import { useLeaderboard } from "./useLeaderboard";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function figureOf(r: BoardRow, sort: BoardSort): Pick<RankingRow, "figure" | "tone"> {
  if (sort === "roi") {
    if (r.roiBps === null) return { figure: "—", tone: "flat" };
    return { figure: `${r.roiBps > 0 ? "+" : ""}${(r.roiBps / 100).toFixed(1)}%`, tone: r.roiBps > 0 ? "up" : r.roiBps < 0 ? "down" : "flat" };
  }
  // Rounded to the cent as the terminal rounds; a P&L that rounds to zero reads "$0.00", never a red "−$0.00".
  const pnl = BigInt(r.pnlBase);
  const tone = moneyTone(pnl);
  return { figure: money(pnl, true), tone: tone === "is-up" ? "up" : tone === "is-down" ? "down" : "flat" };
}

function toRow(r: BoardRow, sort: BoardSort): RankingRow {
  return {
    rank: r.rank,
    owner: r.owner,
    label: short(r.owner),
    byline: L.byline(r.tradeCount, r.settledTrades, r.winRatePct, r.bestStreak),
    href: addressUrl(r.owner as Address, webEnv.markets.network),
    ...figureOf(r, sort),
  };
}

export function LeaderboardScreen() {
  const [sort, setSort] = useState<BoardSort>("pnl");
  const [period, setPeriod] = useState<Period>("week");
  const { address } = useWalletSession();
  const board = useLeaderboard(period, sort, address);
  const me = address?.toLowerCase() ?? null;
  const rows = board.data?.rankings.map((r) => toRow(r, sort)) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-(--content-wide) flex-col gap-6 px-gutter py-8 lg:px-gutter-desktop">
      <header className="flex flex-col gap-2">
        <span className="type-label-micro text-ink-secondary">{L.eyebrow}</span>
        <h1 className="type-display text-ink">{L.title}</h1>
        <p className="max-w-(--content-reading) type-body text-ink-secondary">{L.lead}</p>
      </header>

      <MotionScope>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl label={L.sortLabel} options={L.sorts} value={sort} onValueChange={setSort} />
          <SegmentedControl label={L.periodLabel} options={L.periods} value={period} onValueChange={setPeriod} />
        </div>
      </MotionScope>

      {board.isPending ? (
        <LoadingState shape="plate" label={L.loading} />
      ) : board.isError && !board.data ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-6 py-8 text-center">
          <p className="type-body-strong text-ink">{L.error}</p>
          <button type="button" onClick={() => void board.refetch()} className="inline-flex min-h-touch items-center rounded-full border border-hairline px-5 type-body-strong text-ink hover:bg-surface-2">
            {L.retry}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState why={period === "all" ? L.empty : L.emptyPeriod} />
      ) : (
        <div className={`flex flex-col gap-6 transition-opacity ${board.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={board.isPlaceholderData}>
          <p className="type-caption text-ink-secondary">{L.summary(board.data!.totalWallets, board.data!.closedCalls)}</p>
          <LeaderboardPodium label={L.podium} places={rows.slice(0, 3)} />
          <LeaderboardRankings label={L.list} rows={rows} you={board.data!.you ? toRow(board.data!.you, sort) : null} youOwner={me} youLabel={L.you} />
        </div>
      )}

      <p className="max-w-(--content-reading) type-caption text-ink-secondary">{L.foot}</p>
    </div>
  );
}
