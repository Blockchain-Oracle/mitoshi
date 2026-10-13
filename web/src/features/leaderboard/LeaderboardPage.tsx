"use client";
/**
 * The /leaderboard island (the /surface shape, §3.1, D-071): the board loads with the late data layer, which carries
 * the query client; before that, a named wait. Keeps the board's code out of the route's first load.
 */
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { LEADERBOARD } from "./copy";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { podium as podiumShape } from "@/components/states/shapes/games";

function Placeholder() {
  return (
    <div className="mx-auto w-full max-w-(--content-wide)">
      <LoadingFrame shape="podium" label={LEADERBOARD.loading}>{podiumShape()}</LoadingFrame>
    </div>
  );
}

const LeaderboardScreen = dynamic(() => import("./LeaderboardScreen").then((m) => m.LeaderboardScreen), { ssr: false, loading: () => <Placeholder /> });

export function LeaderboardPage() {
  const ready = useDataReady();
  return ready ? <LeaderboardScreen /> : <Placeholder />;
}
