"use client";
/** The /agents islands (the /leaderboard shape): the board and the cockpit load with the late data layer; before that,
 *  a placeholder shaped like each page (R4-6: `agents-board`, `cockpit`), with no wrapper — the stage is the inset. */
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useDataReady } from "@/providers/data/context";
import { AGENTS } from "./copy";

const Board = () => <LoadingState shape="agents-board" label={AGENTS.loading} />;
const Cockpit = () => <LoadingState shape="cockpit" label={AGENTS.loading} />;
const AgentsScreen = dynamic(() => import("./AgentsScreen").then((m) => m.AgentsScreen), { ssr: false, loading: () => <Board /> });
const AgentProfile = dynamic(() => import("./AgentProfile").then((m) => m.AgentProfile), { ssr: false, loading: () => <Cockpit /> });

export function AgentsPage() {
  const ready = useDataReady();
  return ready ? <AgentsScreen /> : <Board />;
}

export function AgentProfilePage({ strategyId }: { strategyId: string }) {
  const ready = useDataReady();
  return ready ? <AgentProfile strategyId={strategyId} /> : <Cockpit />;
}
