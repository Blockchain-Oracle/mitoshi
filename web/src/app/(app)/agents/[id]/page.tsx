// `/agents/[id]` (S9.8): one agent — its ERC-8004 identity, record, runner, decisions with what paid for them, copy
// trades and feedback (`features/agents/AgentProfile`). The id is the strategy's (its registration file is served at
// `/api/agents/<id>/registration.json`). Read at request time, the /u/[address] shape (params inside Suspense).
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { AgentProfilePage } from "@/features/agents/AgentsPage";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: /^\d+$/.test(id) ? `Agent #${id}` : "Agent", description: "An agent's record, decisions and identity." };
}

async function Agent({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return <p className="type-body text-ink-secondary">No such agent.</p>;
  return <AgentProfilePage strategyId={id} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<LoadingState shape="cockpit" label="Reading the agent" />}>
      <Agent params={params} />
    </Suspense>
  );
}
