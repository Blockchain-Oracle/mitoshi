"use client";
// Rank before its rows (R6 games §4.8, T07/T16): the board waits as itself — three discs on three bars, then five rows
// (the podium's and the rankings' settled boxes, From 21st.dev 19999 animbits/skeleton-loader via the kit's bones) — and
// names the wait only after 3 s ("Reading the board · 0:04"), turning honest at 15 s with Retry. A failed read is the
// kit's ErrorState with Retry; no store is a frame EmptyState back to Games; an empty ladder says why and names the
// game that fills it. No bare one-liners.
import { diagnosis } from "@cwf/core";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingFrame, WaitingText, useWaitClock } from "@/components/states";
import { RowBones, Skeleton } from "@/components/states/shapes/bones";
import { GAMES } from "../copy";

export type RankTab = keyof typeof GAMES.rank.tabs;

const R = GAMES.rank;
const PODIUM_BARS = ["h-14", "h-20", "h-12"] as const;
const ROWS = 5;

export function BoardBones({ retry }: { retry: () => void }) {
  // The start is taken after mount (a static page never reads the clock while it prerenders).
  const [startedAtMs, setStartedAtMs] = useState<number>();
  useEffect(() => setStartedAtMs(Date.now()), []);
  const clock = useWaitClock(startedAtMs);
  return (
    <div className="rk-board">
      {/* Its own line at the top, reserved from the start so nothing moves when the words arrive at 3 s. */}
      <div className="rk-wait">
        {clock.late && startedAtMs !== undefined ? (
          <WaitingText as="p" startedAtMs={startedAtMs} onRetry={retry} timeout={{ title: R.late }}>
            {R.reading}
          </WaitingText>
        ) : null}
      </div>
      <LoadingFrame shape="rank-board" label={R.reading}>
        <div className="skel-podium">
          {PODIUM_BARS.map((h) => (
            <div key={h} className="flex flex-col items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className={`${h} w-full rounded-t-md`} />
            </div>
          ))}
        </div>
        <div className="skel-card gap-0 py-1">
          {Array.from({ length: ROWS }, (_, i) => <RowBones key={i} />)}
        </div>
      </LoadingFrame>
    </div>
  );
}

export const BoardFailed = ({ retry }: { retry: () => void }) => (
  <ErrorState diagnosis={diagnosis("indexer-down", "rank board unreadable")} retry={retry} />
);

export const BoardUnconfigured = () => (
  <EmptyState why={R.none.why} detail={R.none.detail} nextAction={{ label: R.none.action, href: "/games" }} />
);

export function BoardEmpty({ tab }: { tab: RankTab }) {
  const e = R.empties[tab];
  return <EmptyState why={e.why} detail={e.detail} nextAction={{ label: e.label, href: e.href }} />;
}

interface BoardRead {
  isError: boolean;
  refetch: () => unknown;
}

/**
 * The board's state before its rows, or null when there are rows to draw. Rows already read stay up through a failed
 * refresh (the last good board); only a first read that fails is the error.
 */
export function boardGate(q: BoardRead, tab: RankTab, read: { configured: boolean; count: number } | undefined) {
  const retry = () => void q.refetch();
  if (!read) return q.isError ? <BoardFailed retry={retry} /> : <BoardBones retry={retry} />;
  if (!read.configured) return <BoardUnconfigured />;
  if (read.count === 0) return <BoardEmpty tab={tab} />;
  return null;
}
