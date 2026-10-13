"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/AgentsScreen.tsx's board row (R4-6, D-227) — rank 01 in the
// mono face, the agent's own portrait (seeded per strategy, never by its runner: house agents share one runner), its name
// to /agents/[id], the top badge and accent edge on #1, "N copiers · N trades", then figure cells: Entrusted (accent) ·
// Net (with its settled count) · Max / trade · Last active. Two-up on phones, one row from 768.
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
    <li className={cn("agents-row", top && "agents-row--top")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="agents-rank">{String(rank).padStart(2, "0")}</div>
          <AgentPortrait seed={seed} name={name} size="row" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/agents/${s.strategyId}`} className="agents-name strat-mono-12 truncate text-ink transition-colors">{name}</Link>
              {top && <span className="agents-top-badge">{A.top}</span>}
            </div>
            <div className="strat-mono-11 mt-1 truncate text-ink-muted">{A.byline(s.subscribers, s.record.copyTrades)}</div>
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
          <div><div className="agents-label">{A.cells.last}</div><div className="strat-mono-12 text-ink-secondary">{ago(s.record.lastActiveSec * 1000, nowMs)}</div></div>
        </div>
      </div>
    </li>
  );
}
