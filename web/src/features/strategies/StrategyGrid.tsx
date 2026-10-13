"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StrategyGrid.tsx (R4-6, D-227) — the published strategies
// under a sticky tab row with counts (All · Settled · Agents · Memory · Most copied · Safest · New; a tab with nothing in
// it is hidden), one to three columns, an honest empty line.
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { STRATEGIES } from "./copy";
import type { StrategyWire } from "./protocol";
import { StrategyCard, tierOf } from "./StrategyCard";
import "./strategies.css";

const TABS = ["all", "settled", "agents", "memory", "copied", "safest", "new"] as const;
type TabKey = (typeof TABS)[number];
const A = STRATEGIES.archive;

export function filterSort(list: readonly StrategyWire[], tab: TabKey): StrategyWire[] {
  let out = [...list];
  if (tab === "settled") out = out.filter((c) => tierOf(c).key === "settled");
  else if (tab === "new") out = out.filter((c) => tierOf(c).key === "new");
  else if (tab === "agents") out = out.filter((c) => c.agentId !== null);
  else if (tab === "memory") out = out.filter((c) => c.memory !== null);
  const settledFirst = (a: StrategyWire, b: StrategyWire) => (tierOf(b).key === "settled" ? 1 : 0) - (tierOf(a).key === "settled" ? 1 : 0);
  const cap = (c: StrategyWire) => BigInt(c.envelope.maxStakePerTradeBase);
  if (tab === "copied") out.sort((a, b) => b.subscribers - a.subscribers || b.record.fills - a.record.fills);
  else if (tab === "safest") out.sort((a, b) => (cap(a) === cap(b) ? 0 : cap(a) < cap(b) ? -1 : 1));
  else out.sort((a, b) => settledFirst(a, b) || b.record.fills - a.record.fills || b.subscribers - a.subscribers);
  return out;
}

export function StrategyGrid({ strategies, copyingOf, onOpen }: { strategies: readonly StrategyWire[]; copyingOf: (id: string) => "none" | "follow" | "fade"; onOpen: (card: StrategyWire) => void }) {
  const [show, setShow] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const visible = useMemo(() => filterSort(strategies, tab), [strategies, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((k) => [k, filterSort(strategies, k).length])) as Record<TabKey, number>, [strategies]);
  return (
    <section className="flex flex-col gap-5" aria-labelledby="strat-archive">
      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-6">
        <div>
          <h2 id="strat-archive" className="strat-h2">{A.title}</h2>
          <p className="strat-meta mt-1 text-ink/35">{A.count(strategies.length)}</p>
        </div>
        <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show} className="strat-toggle">
          {show ? A.hide : A.show(strategies.length)}
        </button>
      </div>
      {show && (
        <>
          <div className="strat-tabbar">
            <div className="strat-tabbar-row" role="group" aria-label={A.title}>
              {TABS.filter((k) => k === "all" || counts[k] > 0).map((k) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn("strat-tab", tab === k && "strat-tab--on")}>
                  {STRATEGIES.tabs[k]}
                  <span className="strat-tab-count tabular-nums">{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="strat-empty">
              <h3 className="strat-h2">{strategies.length === 0 ? A.none : A.noTab(STRATEGIES.tabs[tab])}</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
              {visible.map((card) => (
                <StrategyCard key={card.strategyId} card={card} copying={copyingOf(card.strategyId)} onOpen={() => onOpen(card)} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
