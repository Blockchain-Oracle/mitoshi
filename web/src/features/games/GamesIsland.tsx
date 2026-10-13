"use client";
// The games' data-reading screens as islands (§3.1, D-071; P4, D-223): the hub and Practice read the venue (lanes, the
// Range reserve), so they load with the late data layer, as /markets does — the route's first load stays the shell.
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { ListWait, StageWait } from "./GameWaits";

/**
 * Each island waits in its own shape (R6 T18, D-230): a play route as its stage, a list route as its list — the same
 * placeholder its route's `loading.tsx` draws, so a navigation swaps it once, in place (R4-13a). The hub's hall outline
 * lives with the hub (`HubIsland.tsx`).
 */
const Wait = StageWait;
const Practice = dynamic(() => import("./practice/PracticeStage").then((m) => m.PracticeStage), { ssr: false, loading: StageWait });
const Rank = dynamic(() => import("./rank/GamesRank").then((m) => m.GamesRank), { ssr: false, loading: ListWait });
const History = dynamic(() => import("./history/GamesHistory").then((m) => m.GamesHistory), { ssr: false, loading: ListWait });
const Lucky = dynamic(() => import("./lucky/LuckyStage").then((m) => m.LuckyStage), { ssr: false, loading: StageWait });
const Duel = dynamic(() => import("./duel/DuelStage").then((m) => m.DuelStage), { ssr: false, loading: StageWait });
const DuelMatch = dynamic(() => import("./duel/DuelMatchView").then((m) => m.DuelMatchView), { ssr: false, loading: StageWait });

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
  return useDataReady() ? <Rank /> : <ListWait />;
}

export function HistoryIsland() {
  return useDataReady() ? <History /> : <ListWait />;
}
