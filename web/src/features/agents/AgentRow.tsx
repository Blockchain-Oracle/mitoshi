"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/AgentsScreen.tsx's board row (R4-6, D-227) — rank 01 in the
// mono face, the agent's own portrait (seeded per strategy, never by its runner: house agents share one runner), its name
// (the whole row a link to /agents/[id], LeaderboardRankings' link and focus), the top badge and accent edge on #1,
// "N copiers · N decisions" (every call or read it made, R6 #9), then figure cells: Entrusted (accent) · Net (with its
// settled count) · Max / trade · Last decision. Two-up on phones, one row from 768.
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AgentPortrait } from "../strategies/AgentPortrait";
import { usd } from "../strategies/format";
import { strategyIdentity } from "../strategies/identity";
import { ago } from "../strategies/names";
import type { StrategyWire } from "../strategies/protocol";
import { AGENTS as A } from "./copy";

export function AgentRow({ s, rank, nowMs }: { s: StrategyWire; rank: number; nowMs: number }) {
  const { name, seed } = strategyIdentity(s);
  const net = BigInt(s.record.netBase);
  const top = rank === 1;
  return (
    <li>
      <Link href={`/agents/${s.strategyId}`} className={cn("agents-row flex flex-col gap-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:flex-row md:items-center", top && "agents-row--top")}>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="agents-rank">{String(rank).padStart(2, "0")}</div>
          <AgentPortrait seed={seed} name={name} size="row" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="agents-name strat-mono-12 truncate text-ink transition-colors">{name}</span>
              {top && <span className="agents-top-badge">{A.top}</span>}
            </div>
            <div className="strat-mono-11 mt-1 truncate text-ink-muted">{A.byline(s.subscribers, s.decisions.total)}</div>
          </div>
        </div>
        <div className="agents-cells">
          <div><div className="agents-label">{A.cells.entrusted}</div><div className="agents-figure agents-figure--v">{usd(BigInt(s.record.entrustedBase))}</div></div>
          <div>
            <div className="agents-label">{A.cells.net}</div>
            <div className={cn("agents-figure", s.record.settled === 0 ? "text-ink-muted" : net > 0n ? "text-profit" : net < 0n ? "text-loss" : "text-ink")}>
              {A.net(net, s.record.settled)}
              {s.record.settled > 0 && <span className="agents-figure-sub">{A.settled(s.record.settled)}</span>}
            </div>
          </div>
          <div><div className="agents-label">{A.cells.max}</div><div className="agents-figure text-ink">{usd(BigInt(s.envelope.maxStakePerTradeBase))}</div></div>
          <div><div className="agents-label">{A.cells.last}</div><div className="strat-mono-12 text-ink-secondary">{ago(s.decisions.lastAtMs ?? s.record.lastActiveSec * 1000, nowMs)}</div></div>
        </div>
      </Link>
    </li>
  );
}
