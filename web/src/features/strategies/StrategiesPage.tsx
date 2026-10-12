"use client";
/**
 * The /strategies island (the /leaderboard shape, §3.1, D-071): the desk loads with the late data layer, which carries the
 * query client and the submitter; before that, a named wait. Keeps the desk's code out of the route's first load.
 */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { STRATEGIES } from "./copy";

function Placeholder() {
  return (
    <div className="mx-auto w-full max-w-(--content-wide) px-gutter py-8 lg:px-gutter-desktop">
      <LoadingState shape="page" label={STRATEGIES.loading} />
    </div>
  );
}

const StrategiesScreen = dynamic(() => import("./StrategiesScreen").then((m) => m.StrategiesScreen), { ssr: false, loading: () => <Placeholder /> });

export function StrategiesPage() {
  const ready = useDataReady();
  return ready ? <StrategiesScreen /> : <Placeholder />;
}
