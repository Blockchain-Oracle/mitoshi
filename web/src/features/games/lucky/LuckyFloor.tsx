"use client";
// Lucky before a game (R6 games §4.7, S26; Turf's activity strip of small chips, TikTok's live ranks beside the
// action): under SPIN, the latest draws across every wallet as a strip that scrolls by hand (From 21st.dev 19171
// haydenbleasel/ticker on the kit's ScrollRail 10484 — symbol, logo, figure and change become asset, side, reach, stake
// and the verdict; no auto-scroll, WCAG 2.2.2), then the top streaks. Real reads only (`/api/games/lucky/recent`,
// `/api/games/lucky/board`); an empty read is an inline empty state with its action, a pending one the strip's and the
// rows' bones, a failed one an error with Retry (one for both when the draw server is down).
import { diagnosis, formatBaseUnits } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import { ScrollRail } from "@/components/kit/ScrollRail";
import { EmptyState, ErrorState, LoadingFrame } from "@/components/states";
import { Skeleton } from "@/components/states/shapes/bones";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { LUCKY } from "./copy";
import type { LuckyBoardWire, LuckyRecentResponse, LuckyRecentWire } from "./lucky-wire";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (base: string) => `$${formatBaseUnits(BigInt(base), 6, { minDp: 0 })}`;
const STREAKS = 5;

export function useRecentDraws() {
  return useQuery({
    queryKey: ["games", "lucky", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/games/lucky/recent");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as LuckyRecentResponse;
    },
    refetchInterval: 20_000,
    retry: 1,
  });
}

function useLuckyBoard() {
  return useQuery({
    queryKey: ["games", "lucky", "board"],
    queryFn: async () => {
      const res = await fetch("/api/games/lucky/board");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as LuckyBoardWire;
    },
    staleTime: 30_000,
    retry: 1,
  });
}

function DrawChip({ d }: { d: LuckyRecentWire }) {
  const F = LUCKY.floor;
  const verdict = F.verdict[d.result];
  return (
    <span className="lk-draw" data-result={d.result}>
      {d.asset ? <AssetDisc asset={d.asset} className="lk-draw-disc" /> : null}
      <span className="lk-draw-asset">{d.asset ?? "—"}</span>
      {d.side ? <span className="lk-draw-side" data-side={d.side}>{d.side === "up" ? "▲" : "▼"}</span> : null}
      {d.multiplier ? <span className="lk-draw-reach">×{d.multiplier}</span> : null}
      <span className="lk-draw-stake">{usd(d.costBase ?? d.stakeBase)}</span>
      <span className="lk-draw-verdict">{verdict}</span>
    </span>
  );
}

const DrawBones = () => (
  <LoadingFrame shape="lucky-draws" label={LUCKY.floor.liveDraws} className="lk-draw-bones">
    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-44 flex-none rounded-full" />)}
  </LoadingFrame>
);

const StreakBones = () => (
  <LoadingFrame shape="lucky-streaks" label={LUCKY.floor.streaks}>
    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
  </LoadingFrame>
);

export function LuckyFloor({ onSpin }: { onSpin: () => void }) {
  const recent = useRecentDraws();
  const board = useLuckyBoard();
  const F = LUCKY.floor;
  const rows = recent.data?.rows ?? [];
  const streaks = (board.data?.rows ?? []).slice(0, STREAKS);
  const retry = () => {
    if (recent.isError) void recent.refetch();
    if (board.isError) void board.refetch();
  };
  const unreadable = <ErrorState diagnosis={diagnosis("indexer-down", "lucky floor unreadable")} retry={retry} />;
  if (recent.isError && board.isError) {
    return <section className="lk-floor" aria-label={F.label}>{unreadable}</section>;
  }
  return (
    <section className="lk-floor" aria-label={F.label}>
      <h2 className="lk-floor-title">{F.liveDraws}</h2>
      {recent.isError ? (
        unreadable
      ) : recent.isPending ? (
        <DrawBones />
      ) : rows.length === 0 ? (
        <EmptyState why={F.emptyWhy} detail={F.emptyDetail} nextAction={{ label: F.spin, onClick: onSpin }} />
      ) : (
        <ScrollRail label={F.liveDraws} className="lk-draws">
          {rows.map((d) => (
            <DrawChip key={d.drawId} d={d} />
          ))}
        </ScrollRail>
      )}

      <h2 className="lk-floor-title">{F.streaks}</h2>
      {board.isError ? (
        unreadable
      ) : board.isPending ? (
        <StreakBones />
      ) : streaks.length === 0 ? (
        <EmptyState why={F.noStreaksWhy} detail={F.noStreaksDetail} nextAction={{ label: F.ladder, href: "/games/rank?tab=lucky" }} />
      ) : (
        <ol className="lk-streaks">
          {streaks.map((r, i) => (
            <li key={r.wallet} className="lk-streak-row">
              <span className="lk-streak-rank">{i + 1}</span>
              <AccountAvatar seed={r.wallet} size={24} />
              <span className="lk-streak-who">{short(r.wallet)}</span>
              <span className="lk-streak-n">{F.streakOf(r.streak, r.best)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
