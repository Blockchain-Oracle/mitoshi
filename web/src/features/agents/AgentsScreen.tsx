"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/AgentsScreen.tsx (R4-6, D-227) on Mitoshi's registry and
// rankAgents (board.ts, Q-001's inherited order): the board under AgentsHead (the title and entry links, drawn by
// AgentsPage from the first paint, with the not-advice line) — the stat strip (Agents · Strategies · Copiers · Entrusted,
// from the same read), the order as two tabs (Most backed · P&L) and one AgentRow per ERC-8004 agent. The stage is the
// one inset.
import Link from "next/link";
import { useState } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { cn } from "@/lib/utils";
import { usd } from "../strategies/format";
import { useStrategies } from "../strategies/useStrategies";
import { AgentRow } from "./AgentRow";
import { rankAgents, type BoardSort } from "./board";
import { AGENTS as A } from "./copy";
import "../strategies/strategies.css";
import "../strategies/builder.css";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="agents-stat">
      <div className="strat-meta mb-2 text-ink-muted">{label}</div>
      <div className="agents-stat-value">{value}</div>
    </div>
  );
}

export function AgentsScreen() {
  const [sort, setSort] = useState<BoardSort>("inherited");
  const reading = useStrategies();
  const strategies = reading.data?.strategies ?? [];
  const ranked = rankAgents(strategies, sort);
  const nowMs = Date.now();
  return (
    <>
      {reading.isPending ? (
        <LoadingState shape="agents-board" label={A.loading} />
      ) : reading.isError && !reading.data ? (
        <div role="alert" className="strat-empty flex flex-col items-center gap-3">
          <p className="strat-h2">{A.error}</p>
          <button type="button" onClick={() => void reading.refetch()} className="strat-sensei">{A.retry}</button>
        </div>
      ) : !reading.data?.deployed ? (
        <div className="strat-empty"><p className="strat-h2">{A.notDeployed}</p></div>
      ) : (
        <>
          <div className="agents-stats">
            <Stat label={A.stats.agents} value={String(ranked.length)} />
            <Stat label={A.stats.strategies} value={String(strategies.length)} />
            <Stat label={A.stats.copiers} value={String(ranked.reduce((n, s) => n + s.subscribers, 0))} />
            <Stat label={A.stats.entrusted} value={usd(ranked.reduce((n, s) => n + BigInt(s.record.entrustedBase), 0n))} />
          </div>
          <div className="strat-tabbar-row border-b border-hairline" role="group" aria-label={A.sortLabel}>
            {A.sorts.map((o) => (
              <button key={o.value} type="button" title={o.title} aria-pressed={sort === o.value} onClick={() => setSort(o.value)} className={cn("strat-tab", sort === o.value && "strat-tab--on")}>{o.label}</button>
            ))}
          </div>
          {ranked.length === 0 ? (
            <div className="strat-empty flex flex-col items-center gap-4">
              <h2 className="strat-h2">{A.empty}</h2>
              <Link href="/strategies" className="desk-btn-primary">{A.emptyCta}</Link>
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {ranked.map((s, i) => <AgentRow key={s.strategyId} s={s} rank={i + 1} nowMs={nowMs} />)}
            </ol>
          )}
        </>
      )}
    </>
  );
}
