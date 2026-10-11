// `/agents` (S9.8; L-54): S9 replaces the registered pending page with the agents board — every strategy with an ERC-8004
// identity, in Masayume's inherited order (labelled) or by P&L, each row with its sample size (`features/agents`).
import type { Metadata } from "next";
import { AgentsPage } from "@/features/agents/AgentsPage";

export const metadata: Metadata = { title: "Agents", description: "Agents you can copy: strategies with an on-chain ERC-8004 identity, their records as the chain settled them, and the runner's own words." };

export default function Page() {
  return <AgentsPage />;
}
