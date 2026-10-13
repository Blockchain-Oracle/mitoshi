"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/history/RecordSection.tsx (R4-4, D-227) — `NN · Your record`: the
// summary strip, then the reputation and the badges, all reading the one account history (core `computeTraderEdge`
// and edge/record.ts `recordOf`). The 21st P&L chart it replaced stays on Trader Edge, the one place it is drawn.
import { computeTraderEdge, type Address, type Reading, type WalletHistory } from "@cwf/core";
import { useMemo } from "react";
import { SectionHeader } from "@/components/kit";
import { ReadingBoundary } from "@/components/states";
import { recordOf } from "@/features/edge/record";
import { HISTORY } from "../copy";
import { BadgeGrid } from "./BadgeGrid";
import { HistorySummary } from "./HistorySummary";
import { ReputationPanel } from "./ReputationPanel";

export function RecordSection({ history, openCount, address, index, retry }: { history: Reading<WalletHistory> | null; openCount: number | null; address: Address; index: string; retry: () => void }) {
  const value = history?.ok ? history.value : null;
  const derived = useMemo(() => {
    if (!value) return null;
    const edge = computeTraderEdge(value.rounds, openCount ?? value.openCount);
    const { reputation, badges } = recordOf({ wins: edge.wins, losses: edge.losses, currentWinStreak: edge.currentWinStreak, fillCount: value.fillCount, stakeBase: edge.stakeBase, decimals: value.decimals });
    return { edge, reputation, badges };
  }, [value, openCount]);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="record-title">
      <SectionHeader id="record-title" index={index} title={HISTORY.summary.title} />
      <ReadingBoundary reading={history} shape="plate" retry={retry}>
        {(read) =>
          derived ? (
            <div className="flex flex-col gap-4">
              <HistorySummary history={read} edge={derived.edge} address={address} />
              <ReputationPanel reputation={derived.reputation} />
              <BadgeGrid badges={derived.badges} />
            </div>
          ) : null
        }
      </ReadingBoundary>
    </section>
  );
}
