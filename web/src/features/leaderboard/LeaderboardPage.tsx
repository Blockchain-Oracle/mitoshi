"use client";
/**
 * The /leaderboard island (the /surface shape, §3.1, D-071): the board loads with the late data layer, which carries
 * the query client; before that, a named wait. Keeps the board's code out of the route's first load.
 */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { LEADERBOARD } from "./copy";

function Placeholder() {
  return (
    <div className="mx-auto w-full max-w-(--content-wide)">
      <LoadingState shape="podium" label={LEADERBOARD.loading} />
    </div>
  );
}

const LeaderboardScreen = dynamic(() => import("./LeaderboardScreen").then((m) => m.LeaderboardScreen), { ssr: false, loading: () => <Placeholder /> });

export function LeaderboardPage() {
  const ready = useDataReady();
  return ready ? <LeaderboardScreen /> : <Placeholder />;
}
