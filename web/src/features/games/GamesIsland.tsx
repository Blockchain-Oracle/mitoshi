"use client";
// The games' data-reading screens as islands (§3.1, D-071; P4, D-223): the hub and Practice read the venue (lanes, the
// Range reserve), so they load with the late data layer, as /markets does — the route's first load stays the shell.
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";

/** The same placeholder as `app/(app)/games/loading.tsx` draws, so a navigation swaps it once, in place (R4-13a). */
const Wait = () => <div className="container"><LoadingState shape="page" label="Loading" /></div>;
const Hub = dynamic(() => import("./GamesHub").then((m) => m.GamesHub), { ssr: false, loading: Wait });
const Practice = dynamic(() => import("./practice/PracticeStage").then((m) => m.PracticeStage), { ssr: false, loading: Wait });
const Rank = dynamic(() => import("./rank/GamesRank").then((m) => m.GamesRank), { ssr: false, loading: Wait });
const History = dynamic(() => import("./history/GamesHistory").then((m) => m.GamesHistory), { ssr: false, loading: Wait });
const Lucky = dynamic(() => import("./lucky/LuckyStage").then((m) => m.LuckyStage), { ssr: false, loading: Wait });
const Duel = dynamic(() => import("./duel/DuelStage").then((m) => m.DuelStage), { ssr: false, loading: Wait });
const DuelMatch = dynamic(() => import("./duel/DuelMatchView").then((m) => m.DuelMatchView), { ssr: false, loading: Wait });

export function GamesHubIsland() {
  return useDataReady() ? <Hub /> : <Wait />;
}

export function PracticeIsland() {
  return useDataReady() ? <Practice /> : <Wait />;
}

export function LuckyIsland() {
  return useDataReady() ? <Lucky /> : <Wait />;
}

/** The duel writes through the submitter the late data layer carries (R4-9, D-227). */
export function DuelIsland() {
  return useDataReady() ? <Duel /> : <Wait />;
}

export function DuelMatchIsland({ matchId }: { matchId: string }) {
  return useDataReady() ? <DuelMatch matchId={matchId} /> : <Wait />;
}

/** Rank and History read through the query client the late data layer carries (R4-9, D-227). */
export function RankIsland() {
  return useDataReady() ? <Rank /> : <Wait />;
}

export function HistoryIsland() {
  return useDataReady() ? <History /> : <Wait />;
}
