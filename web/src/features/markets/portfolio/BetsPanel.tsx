"use client";
/**
 * Your bets — Ported from Owarine 90a91d71:web/src/features/markets/portfolio/BetsPanel.tsx (over Masayume 68f7a09's),
 * R4-4 (D-227): `01 · Your bets` with the Open / History tabs on the same line, one plate. Open is every position the
 * account holds — the wallet's, the Trading Balance's and the Boosts' (`useTerminalPositions`), valued and closed as
 * the terminal values and closes them — and its count waits until every home has answered. History is the account's
 * settled Windows (Owarine's two-line rows, each with its receipt), with a retry of its own. Eight rows a page.
 */
import type { Diagnosis, Reading, WalletHistory } from "@cwf/core";
import { useState } from "react";
import { SectionHeader } from "@/components/kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import type { useBoostWrites } from "@/features/boost/useBoostWrites";
import type { useTerminalClose } from "@/features/terminal/useTerminalClose";
import type { PositionValue } from "@/features/terminal/usePositionValue";
import { usePager } from "@/lib/use-pager";
import { cn } from "@/lib/utils";
import { PORTFOLIO } from "../copy";
import { HistoryRows } from "../history/HistoryRows";
import { Pager } from "../Pager";
import { BetRow } from "./BetRow";
import type { BetGroup } from "./usePortfolioPositions";

type Tab = "open" | "history";
const PAGE = 8;

/** The Open tab's rows and what values and closes them (the page owns the valuers, so every row is valued on any page). */
export interface OpenBets {
  groups: BetGroup[];
  values: ReadonlyMap<string, PositionValue>;
  closer: ReturnType<typeof useTerminalClose>;
  boosts: ReturnType<typeof useBoostWrites>;
  /** Null until the wallet, the Trading Balance and the Boosts have all answered. */
  count: number | null;
  /** A home that failed to read: said above the rows it could read, with a retry (never a silent short list). */
  failed: { diagnosis: Diagnosis; retry: () => void } | null;
}

function OpenList({ open }: { open: OpenBets }) {
  const pager = usePager(open.groups, PAGE);
  if (open.count === null) return <LoadingState shape="row" />;
  const failed = open.failed ? <ErrorState diagnosis={open.failed.diagnosis} retry={open.failed.retry} /> : null;
  if (open.groups.length === 0) return failed ?? <EmptyState why={PORTFOLIO.noBets} nextAction={{ label: PORTFOLIO.firstCall, href: "/trade/BTC" }} />;
  return (
    <div className="bets-fill">
      {failed}
      <ul className="bets-list">
        {pager.slice.map((g) => (
          <BetRow key={g.key} legs={g.legs} values={open.values} closer={open.closer} boosts={open.boosts} />
        ))}
      </ul>
      <Pager pager={pager} />
    </div>
  );
}

export function BetsPanel({ open, history, index, retryHistory }: { open: OpenBets; history: Reading<WalletHistory> | null; index: string; retryHistory: () => void }) {
  const [tab, setTab] = useState<Tab>("open");
  const settledCount = history?.ok ? history.value.rounds.length : null;
  const tabButton = (t: Tab, label: string, count: number | null) => (
    <button type="button" role="tab" aria-selected={tab === t} className={cn("bets-tab", tab === t && "bets-tab--on")} onClick={() => setTab(t)}>
      {label}
      {count !== null && <span className="bets-tab-count numbers">{count}</span>}
    </button>
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="bets-title">
      <SectionHeader
        id="bets-title"
        index={index}
        title={PORTFOLIO.betsTitle}
        aside={
          <div className="bets-tabs" role="tablist" aria-label={PORTFOLIO.betsTitle}>
            {tabButton("open", PORTFOLIO.tabs.open, open.count)}
            {tabButton("history", PORTFOLIO.tabs.history, settledCount)}
          </div>
        }
      />
      <div className="bets-plate" role="tabpanel">
        {tab === "open" ? <OpenList open={open} /> : <HistoryRows history={history} retry={retryHistory} />}
      </div>
    </section>
  );
}
