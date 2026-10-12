"use client";
/**
 * Your bets (Ported from Masayume 68f7a09:web/src/features/markets/portfolio/BetsPanel.tsx): one plate, two tabs —
 * Open (every position still running, with its cash-out) and History (every settled Window from the fill projection)
 * — eight rows a page with a pager, never an endless scroll. D-227: Open lists the wallet's and the Trading Balance's
 * bets valued by the terminal's engine (`usePortfolioPositions`); History is the account's (Trading Balance and Boost
 * rounds too).
 */
import type { Address, Reading } from "@cwf/core";
import type { WalletHistory } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { formatBaseUnits } from "@cwf/core/units";
import { OUTCOME_TO_SIDE } from "@cwf/core";
import { txUrl } from "@cwf/core/urls";
import { useState } from "react";
import { TradeJournal, type JournalEntry } from "@/components/ui/trade-journal";
import { ReadingBoundary } from "@/components/states";
import SectionHead from "@/components/shell/SectionHead";
import { webEnv } from "@/lib/env";
import { usePager } from "@/lib/use-pager";
import { cn } from "@/lib/utils";
import { JOURNAL, PORTFOLIO } from "../copy";
import { SIDE_WORD } from "../side-styles";
import { Pager } from "../Pager";
import type { useTerminalClose } from "@/features/terminal/useTerminalClose";
import type { PositionValue } from "@/features/terminal/usePositionValue";
import { BetRow } from "./BetRow";
import type { BetGroup } from "./usePortfolioPositions";

type Tab = "open" | "history";
const PAGE = 8;

/** The Open tab's rows and what values them (the page owns the valuers, so every row is valued on any page). */
export interface OpenBets {
  groups: BetGroup[];
  values: ReadonlyMap<string, PositionValue>;
  closer: ReturnType<typeof useTerminalClose>;
}

function OpenList({ open, wallet }: { open: OpenBets; wallet: Address }) {
  const pager = usePager(open.groups, PAGE);
  return (
    <>
      <ul className="bets-list">{pager.slice.map((g) => <BetRow key={g.key} legs={g.legs} values={open.values} wallet={wallet} closer={open.closer} />)}</ul>
      <Pager pager={pager} />
    </>
  );
}

/** History as the journal (21st 27124): every settled Window from the fills projection, newest first. */
function HistoryList({ history }: { history: WalletHistory }) {
  const usd = (b: bigint, d: number) => `$${formatBaseUnits(b < 0n ? -b : b, d, { minDp: 2, maxDp: 2 })}`;
  const entries: JournalEntry[] = history.rounds.map((r) => ({
    id: `${r.source}:${r.marketId}`,
    atMs: r.settledAtMs ?? r.expirySec * 1000,
    asset: `${r.asset} · ${formatCadence(r.intervalSec)}`,
    side: r.sidesTraded.map((o) => SIDE_WORD[OUTCOME_TO_SIDE[o]]).join(" + "),
    stake: usd(r.stakeBase, r.decimals),
    net: `${r.pnlBase > 0n ? "+" : r.pnlBase < 0n ? "−" : ""}${usd(r.pnlBase, r.decimals)}`,
    netSign: r.pnlBase > 0n ? 1 : r.pnlBase < 0n ? -1 : 0,
    outcome: r.outcome as JournalEntry["outcome"],
    outcomeLabel: PORTFOLIO.outcome[r.outcome] ?? r.outcome.toUpperCase(),
    formula: PORTFOLIO.pnlFormula,
    // A Trading Balance or Boost round has no single transaction of the wallet's to link (the vault or reserve traded).
    href: r.source === "wallet" ? txUrl(r.entryTxHash, webEnv.markets.network) : undefined,
  }));
  return <TradeJournal entries={entries} labels={JOURNAL} />;
}

export function BetsPanel({ wallet, positions, open, history, index, retry }: { wallet: Address; positions: Reading<unknown> | null; open: OpenBets; history: Reading<WalletHistory> | null; index: string; retry: () => void }) {
  const [tab, setTab] = useState<Tab>("open");
  const openCount = positions?.ok ? open.groups.length : null;
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
          <ReadingBoundary reading={positions} shape="row" retry={retry} isEmpty={() => open.groups.length === 0} empty={{ why: PORTFOLIO.noBets, nextAction: { label: PORTFOLIO.firstCall, href: "/markets" } }}>
            {() => <OpenList open={open} wallet={wallet} />}
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
