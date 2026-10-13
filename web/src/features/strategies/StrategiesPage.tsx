"use client";
/**
 * The /strategies island (the /leaderboard shape, §3.1, D-071): the desk loads with the late data layer, which carries the
 * query client and the submitter; before that, a placeholder shaped like the page (R4-6: LoadingState `strategy-grid`,
 * no wrapper of its own — the stage is the one inset). Keeps the desk's code out of the route's first load.
 */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { STRATEGIES } from "./copy";

const Placeholder = () => <LoadingState shape="strategy-grid" label={STRATEGIES.loading} />;
const StrategiesScreen = dynamic(() => import("./StrategiesScreen").then((m) => m.StrategiesScreen), { ssr: false, loading: () => <Placeholder /> });

export function StrategiesPage() {
  const ready = useDataReady();
  return ready ? <StrategiesScreen /> : <Placeholder />;
}
