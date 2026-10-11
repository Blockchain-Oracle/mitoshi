"use client";
// `/agents` (S9.8; L-54, Q-001): Masayume's agents board over the registry — the inherited order, labelled, with every
// row's P&L and sample size — on S5's rankings rows (21st 13063). A row opens the agent's page.
import { useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { LoadingState } from "@/components/states/LoadingState";
import { LeaderboardRankings, type RankingRow } from "@/components/ui/leaderboard-rankings";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useStrategies } from "../strategies/useStrategies";
import { rankAgents, type BoardSort } from "./board";
import { AGENTS as A } from "./copy";

export function AgentsScreen() {
  const [sort, setSort] = useState<BoardSort>("inherited");
  const reading = useStrategies();
  const ranked = rankAgents(reading.data?.strategies ?? [], sort);
  const rows: RankingRow[] = ranked.map((s, i) => {
    const net = BigInt(s.record.netBase);
    return {
      rank: i + 1, owner: s.runner, label: s.name, byline: A.byline(s.record.settled, s.subscribers, BigInt(s.record.entrustedBase)), figure: A.figure(net, s.record.settled),
      tone: s.record.settled === 0 || net === 0n ? "flat" : net > 0n ? "up" : "down", href: `/agents/${s.strategyId}`,
    };
  });
  return (
    <div className="mx-auto flex w-full max-w-(--content-wide) flex-col gap-6 px-gutter py-8 lg:px-gutter-desktop">
      <header className="flex flex-col gap-2">
        <span className="type-label-micro text-ink-secondary">{A.eyebrow}</span>
        <h1 className="type-display text-ink">{A.title}</h1>
        <p className="max-w-(--content-reading) type-body text-ink-secondary">{A.lead}</p>
      </header>
      <div className="flex flex-col gap-2">
        <SegmentedControl label={A.sortLabel} options={A.sorts} value={sort} onValueChange={setSort} />
        {sort === "inherited" && <p className="max-w-(--content-reading) type-caption text-ink-secondary">{A.inheritedNote}</p>}
      </div>
      {reading.isPending ? (
        <LoadingState shape="plate" label={A.loading} />
      ) : reading.isError && !reading.data ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-6 py-8 text-center">
          <p className="type-body-strong text-ink">{A.error}</p>
          <button type="button" onClick={() => void reading.refetch()} className="inline-flex min-h-touch items-center rounded-full border border-hairline px-5 type-body-strong text-ink hover:bg-surface-2">{A.retry}</button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState why={A.empty} />
      ) : (
        <LeaderboardRankings rows={rows} you={null} youOwner={null} label={A.title} youLabel="" />
      )}
    </div>
  );
}
