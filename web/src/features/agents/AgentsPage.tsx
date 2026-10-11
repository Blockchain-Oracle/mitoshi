"use client";
/** The /agents island (the /leaderboard shape): the board loads with the late data layer; before that, a named wait. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { AGENTS } from "./copy";

function Placeholder() {
  return (
    <div className="mx-auto w-full max-w-(--content-wide) px-gutter py-8 lg:px-gutter-desktop">
      <LoadingState shape="plate" label={AGENTS.loading} />
    </div>
  );
}

const AgentsScreen = dynamic(() => import("./AgentsScreen").then((m) => m.AgentsScreen), { ssr: false, loading: () => <Placeholder /> });
const AgentProfile = dynamic(() => import("./AgentProfile").then((m) => m.AgentProfile), { ssr: false, loading: () => <Placeholder /> });

export function AgentsPage() {
  const ready = useDataReady();
  return ready ? <AgentsScreen /> : <Placeholder />;
}

export function AgentProfilePage({ strategyId }: { strategyId: string }) {
  const ready = useDataReady();
  return ready ? <AgentProfile strategyId={strategyId} /> : <Placeholder />;
}
