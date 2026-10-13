"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/history/HistoryRows.tsx (R4-4, D-227) — the History tab's list:
// the account's settled Windows (the wallet's, the Trading Balance's and finished Boosts', one history since R4-1),
// eight a page, each with its receipt. A capped history says so above the rows rather than trimming quietly.
import type { Reading, SettledRound, WalletHistory } from "@cwf/core";
import { useState } from "react";
import { ReadingBoundary } from "@/components/states";
import { useNowMs } from "@/lib/clock";
import { usePager } from "@/lib/use-pager";
import { HISTORY } from "../copy";
import { Pager } from "../Pager";
import { HistoryReceipt } from "./HistoryReceipt";
import { HistoryRow } from "./HistoryRow";

const PAGE_SIZE = 8;
const NO_ROUNDS: readonly SettledRound[] = [];
const isEmpty = (value: WalletHistory) => value.rounds.length === 0;

export function HistoryRows({ history, retry }: { history: Reading<WalletHistory> | null; retry: () => void }) {
  const nowMs = useNowMs();
  // The last round opened stays in the sheet while it animates closed (Owarine's `shown`), so it never blanks out.
  const [receipt, setReceipt] = useState<{ round: SettledRound; open: boolean } | null>(null);
  const rounds = history?.ok ? history.value.rounds : NO_ROUNDS;
  const pager = usePager(rounds, PAGE_SIZE);
  return (
    <ReadingBoundary reading={history} shape="row" retry={retry} isEmpty={isEmpty} empty={HISTORY.empty}>
      {(value) => (
        <div className="bets-fill">
          {!value.complete ? <p className="type-caption text-warning">{HISTORY.partial}</p> : null}
          <ul className="bets-list">
            {pager.slice.map((round) => (
              <HistoryRow key={`${round.source}:${round.marketId}:${round.openedAtMs}`} round={round} nowMs={nowMs} onReceipt={(r) => setReceipt({ round: r, open: true })} />
            ))}
          </ul>
          <Pager pager={pager} />
          <HistoryReceipt round={receipt?.round ?? null} open={receipt?.open ?? false} onClose={() => setReceipt((r) => (r ? { ...r, open: false } : null))} />
        </div>
      )}
    </ReadingBoundary>
  );
}
