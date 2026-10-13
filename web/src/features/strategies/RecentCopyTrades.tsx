"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/RecentCopyTrades.tsx (R4-6, D-227) — the latest copy trades
// collapsed by copier and strategy, so one person's repeats read as "×N" with their total; the right-hand figure is
// Mitoshi's settled P&L for the group (or "open"), a fade tagged; each row opens its latest transaction.
import { txUrl } from "@cwf/core";
import { useMemo } from "react";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { AgentPortrait } from "./AgentPortrait";
import { STRATEGIES } from "./copy";
import { usd, usdSigned } from "./format";
import { strategyIdentity } from "./identity";
import { ago, shortAddress } from "./names";
import type { FillWire, StrategyWire } from "./protocol";
import "./strategies.css";

const RECENT_LIMIT = 8;
const R = STRATEGIES.recent;

interface Group { strategyId: string; owner: string; fade: boolean; count: number; totalBase: bigint; pnlBase: bigint | null; atSec: number; txHash: string }

export function RecentCopyTrades({ fills, strategies }: { fills: readonly FillWire[]; strategies: readonly StrategyWire[] }) {
  const strategyOf = useMemo(() => new Map(strategies.map((s) => [s.strategyId, s])), [strategies]);
  const grouped = useMemo(() => {
    const g = new Map<string, Group>();
    for (const f of fills) {
      const key = `${f.strategyId}::${f.owner}::${f.mode}`;
      const pnl = f.pnlBase === null ? null : BigInt(f.pnlBase);
      const cur = g.get(key);
      if (!cur) g.set(key, { strategyId: f.strategyId, owner: f.owner, fade: f.mode === "fade", count: 1, totalBase: BigInt(f.cashDeltaBase), pnlBase: pnl, atSec: f.atSec, txHash: f.txHash });
      else {
        cur.count += 1;
        cur.totalBase += BigInt(f.cashDeltaBase);
        if (pnl !== null) cur.pnlBase = (cur.pnlBase ?? 0n) + pnl;
        if (f.atSec > cur.atSec) {
          cur.atSec = f.atSec;
          cur.txHash = f.txHash;
        }
      }
    }
    return [...g.values()].sort((a, b) => b.atSec - a.atSec);
  }, [fills]);
  const nowMs = Date.now();

  return (
    <section aria-labelledby="recent-copy-trades">
      <div className="mb-4 flex items-center gap-3">
        <h2 id="recent-copy-trades" className="strat-rail-title text-ink/40">{R.title}</h2>
        <div className="h-px flex-1 bg-ink/10" />
        <span className="strat-mono-11 tabular-nums text-ink/30">{fills.length}</span>
      </div>
      <div className="strat-rows">
        {grouped.length === 0 ? (
          <div className="strat-rows-empty">{R.empty}</div>
        ) : (
          grouped.slice(0, RECENT_LIMIT).map((t) => {
            const card = strategyOf.get(t.strategyId);
            const { name, seed } = strategyIdentity(card ?? { strategyId: t.strategyId, name: `#${t.strategyId}`, portraitSeed: null });
            return (
              <a key={`${t.strategyId}:${t.owner}:${t.fade}`} href={txUrl(t.txHash as `0x${string}`, webEnv.markets.network)} target="_blank" rel="noreferrer" className="strat-row">
                <AgentPortrait seed={seed} name={name} size="small" />
                <span className="strat-row-name text-ink">{name}</span>
                <span className="strat-mono-12 hidden text-ink/40 sm:inline">{shortAddress(t.owner)}</span>
                {t.fade && <span className="strat-card-tag strat-mem">{R.fade}</span>}
                {t.count > 1 && <span className="strat-mono-10 hidden shrink-0 tabular-nums text-ink/35 sm:inline">{R.copied(t.count)}</span>}
                <span className="flex-1" />
                <span className="strat-mono-12 hidden shrink-0 whitespace-nowrap tabular-nums text-ink/50 sm:inline">{usd(t.totalBase)}</span>
                <span className={cn("strat-mono-12 shrink-0 whitespace-nowrap tabular-nums", t.pnlBase === null ? "text-ink/40" : t.pnlBase > 0n ? "text-profit" : t.pnlBase < 0n ? "text-loss" : "text-ink")}>
                  {t.pnlBase === null ? R.open : usdSigned(t.pnlBase)}
                </span>
                <span className="strat-mono-11 w-14 shrink-0 text-right text-ink/30">{ago(t.atSec * 1000, nowMs)}</span>
                <span className="strat-mono-11 w-4 shrink-0 text-right text-accent">↗</span>
              </a>
            );
          })
        )}
      </div>
    </section>
  );
}
