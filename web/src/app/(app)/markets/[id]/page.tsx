// `/markets/<id>` renders (Agari 03b30ab web/src/app/markets/[id]/page.tsx) instead of Masayume's redirect, which
// dropped the id (ux-audit fix 14, L-21): a shared Window link keeps its context and, in S5, its own link preview.
// Until the engine lands (S4) the Window's page is the registered pending surface; a malformed id goes to the board
// with a note rather than throwing.
import { isMarketId } from "@cwf/core";
import { redirect } from "next/navigation";
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { pendingFor } from "@/lib/capabilities";
import { withNote } from "@/lib/routes";

export const metadata = { title: pendingFor("/markets/[id]").title };

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMarketId(id.toLowerCase())) redirect(withNote("/markets"));
  return <PendingRoute route="/markets/[id]" />;
}
