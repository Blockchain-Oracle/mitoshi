// Per-segment loading boundary (D-050) for /agents (R4-6, D-227): the board's own first paint — the title, the entry
// links, the board's placeholder, the not-advice line — so a navigation that wasn't prefetched draws what the page
// draws, and only the board is replaced (not the group's generic `page` grid first).
import { AgentsHead } from "@/features/agents/AgentsHead";
import { AGENTS } from "@/features/agents/copy";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { agentsBoard as agentsBoardShape } from "@/components/states/shapes/automate";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <AgentsHead />
      <LoadingFrame shape="agents-board" label={AGENTS.loading}>{agentsBoardShape()}</LoadingFrame>
      <p className="strat-advice">{AGENTS.advice}</p>
    </div>
  );
}
