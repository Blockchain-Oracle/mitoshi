// An agent's link preview (R4-13a, D-227; critic gap 6 named /agents/[id] beside the hub and profile cards): the agent's
// name, its settled P&L and record and its copiers, read at request time within the preview budget; without the read
// it says what the page holds.
import { connection } from "next/server";
import { OG_COPY } from "@/features/og/copy";
import { agentImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.agent.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  return agentImage((await params).id);
}
