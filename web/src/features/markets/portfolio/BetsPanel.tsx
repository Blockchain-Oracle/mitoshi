"use client";
/**
 * Your bets (Ported from Masayume 68f7a09:web/src/features/markets/portfolio/BetsPanel.tsx): one plate, two tabs —
 * Open (every position still running, with its cash-out) and History (every settled Window from the fill projection)
 * — eight rows a page with a pager, never an endless scroll.
 */
import type { Address, OpenPosition, Reading } from "@cwf/core";
import type { WalletHistory } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { shortHex } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useState } from "react";
import { Money, UtcTime } from "@/components/data";
import { ReadingBoundary } from "@/components/states";
import SectionHead from "@/components/shell/SectionHead";
import { webEnv } from "@/lib/env";
import { usePager } from "@/lib/use-pager";
import { cn } from "@/lib/utils";
import { PORTFOLIO } from "../copy";
import { Pager } from "../Pager";
import { BetRow } from "./BetRow";

type Tab = "open" | "history";
const PAGE = 8;

function OpenList({ positions, wallet }: { positions: OpenPosition[]; wallet: Address }) {
  const pager = usePager(positions, PAGE);
  return (
    <>
      <ul className="bets-list">{pager.slice.map((p) => <BetRow key={p.marketId} position={p} wallet={wallet} />)}</ul>
      <Pager pager={pager} />
    </>
  );
}

function HistoryList({ history }: { history: WalletHistory }) {
  const pager = usePager(history.rounds, PAGE);
  if (history.rounds.length === 0) return <p className="p-4 type-body text-ink-secondary">{PORTFOLIO.noHistory}</p>;
  return (
    <>
      <ul className="bets-list">
        {pager.slice.map((r) => (
          <li key={r.marketId} className="bets-row">
            <span className="type-label-micro shrink-0 text-ink">{PORTFOLIO.outcome[r.outcome] ?? r.outcome.toUpperCase()}</span>
            <span className="type-body-strong text-ink">{r.asset}</span>
            <span className="type-label-micro text-ink-muted">{formatCadence(r.intervalSec)}</span>
            {r.settledAtMs ? <UtcTime ms={r.settledAtMs} withSeconds={false} className="type-caption text-ink-secondary" /> : null}
            <span className="bets-break" aria-hidden />
            <span className="flex-1" />
            <span className="type-caption text-ink-secondary">{PORTFOLIO.stake} <Money value={r.stakeBase} decimals={r.decimals} /></span>
            <Money value={r.pnlBase} decimals={r.decimals} tone="pnl" className="type-data shrink-0" />
            <a className="min-h-touch type-caption text-ink-secondary underline decoration-dotted" href={txUrl(r.entryTxHash, webEnv.markets.network)} target="_blank" rel="noreferrer">{shortHex(r.entryTxHash)}</a>
          </li>
        ))}
      </ul>
      <Pager pager={pager} />
    </>
  );
}

export function BetsPanel({ wallet, positions, history, index, retry }: { wallet: Address; positions: Reading<OpenPosition[]> | null; history: Reading<WalletHistory> | null; index: string; retry: () => void }) {
  const [tab, setTab] = useState<Tab>("open");
  const openCount = positions?.ok ? positions.value.length : null;
  const settledCount = history?.ok ? history.value.rounds.length : null;
  const tabButton = (t: Tab, label: string, count: number | null) => (
    <button type="button" role="tab" aria-selected={tab === t} className={cn("bets-tab min-h-touch", tab === t && "bets-tab--on")} onClick={() => setTab(t)}>
      {label}
      {count !== null && <span className="bets-tab-count numbers">{count}</span>}
    </button>
  );
  return (
    <section className="flex flex-col gap-4" aria-label={PORTFOLIO.betsTitle}>
      <SectionHead number={index} title={PORTFOLIO.betsTitle} />
      <div className="bets-tabs" role="tablist" aria-label={PORTFOLIO.betsTitle}>
        {tabButton("open", PORTFOLIO.tabs.open, openCount)}
        {tabButton("history", PORTFOLIO.tabs.history, settledCount)}
      </div>
      <div className="bets-plate" role="tabpanel">
        {tab === "open" ? (
          <ReadingBoundary reading={positions} shape="row" retry={retry} isEmpty={(v) => v.length === 0} empty={{ why: PORTFOLIO.noBets, nextAction: { label: PORTFOLIO.firstCall, href: "/markets" } }}>
            {(v) => <OpenList positions={v} wallet={wallet} />}
          </ReadingBoundary>
        ) : (
          <ReadingBoundary reading={history} shape="row" retry={retry}>
            {(h) => <HistoryList history={h} />}
          </ReadingBoundary>
        )}
      </div>
    </section>
  );
}
