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
  return { title: /^\d+$/.test(id) ? `Agent #${id}` : "Agent", description: "An agent's identity, record, decisions and feedback on Mitoshi." };
}

async function Agent({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return <p className="mx-auto max-w-(--content-reading) px-gutter py-10 type-body text-ink-secondary">That isn&apos;t an agent: an agent link ends in its strategy number.</p>;
  return <AgentProfilePage strategyId={id} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<LoadingState shape="plate" className="px-gutter py-10 lg:px-gutter-desktop" label="Reading the agent" />}>
      <Agent params={params} />
    </Suspense>
  );
}
