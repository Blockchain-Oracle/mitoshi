"use client";
/** The /agents islands (the /leaderboard shape): the board and the cockpit load with the late data layer. The board's
 *  title, entry links and not-advice line stand from the first paint (AgentsHead); only the body below is a placeholder
 *  (`agents-board`: the stat strip, the tabs, the rows), which the board's own reading state draws too, so one placeholder
 *  is replaced in place (R4-6 gap 16, D-227). The cockpit's placeholder is the whole page (`cockpit`). No wrapper inset —
 *  the stage is the inset. */
import dynamic from "next/dynamic";
import { useDataReady } from "@/providers/data/context";
import { AgentsHead } from "./AgentsHead";
import { AGENTS } from "./copy";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { agentsBoard as agentsBoardShape, cockpit as cockpitShape } from "@/components/states/shapes/automate";

const Board = () => <LoadingFrame shape="agents-board" label={AGENTS.loading}>{agentsBoardShape()}</LoadingFrame>;
const Cockpit = () => <LoadingFrame shape="cockpit" label={AGENTS.loading}>{cockpitShape()}</LoadingFrame>;
const AgentsScreen = dynamic(() => import("./AgentsScreen").then((m) => m.AgentsScreen), { ssr: false, loading: () => <Board /> });
const AgentProfile = dynamic(() => import("./AgentProfile").then((m) => m.AgentProfile), { ssr: false, loading: () => <Cockpit /> });

export function AgentsPage() {
  const ready = useDataReady();
  return (
    <div className="flex flex-col gap-6">
      <AgentsHead />
      {ready ? <AgentsScreen /> : <Board />}
      <p className="strat-advice">{AGENTS.advice}</p>
    </div>
  );
}

export function AgentProfilePage({ strategyId }: { strategyId: string }) {
  const ready = useDataReady();
  return ready ? <AgentProfile strategyId={strategyId} /> : <Cockpit />;
}
