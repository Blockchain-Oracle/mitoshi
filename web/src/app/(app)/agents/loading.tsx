// Per-segment loading boundary (D-050) for /agents (R4-6, D-227): the board's own first paint — the title, the entry
// links, the board's placeholder, the not-advice line — so a navigation that wasn't prefetched draws what the page
// draws, and only the board is replaced (not the group's generic `page` grid first).
import { LoadingState } from "@/components/states/LoadingState";
import { AgentsHead } from "@/features/agents/AgentsHead";
import { AGENTS } from "@/features/agents/copy";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <AgentsHead />
      <LoadingState shape="agents-board" label={AGENTS.loading} />
      <p className="strat-advice">{AGENTS.advice}</p>
    </div>
  );
}
