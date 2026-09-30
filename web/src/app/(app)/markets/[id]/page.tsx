// `/markets/<id>` renders (Agari 03b30ab web/src/app/markets/[id]/page.tsx) instead of Masayume's redirect, which dropped
// the id (ux-audit fix 14, L-21): the Window opens in the hero with its ticket; a settled one resolves to its successor
// with a note, a malformed id goes to the board with a note rather than throwing.
import { isMarketId, toMarketId } from "@cwf/core";
import { redirect } from "next/navigation";
import { MarketsPage } from "@/features/markets/MarketsPage";
import { pendingFor } from "@/lib/capabilities";
import { withNote } from "@/lib/routes";

export const metadata = { title: pendingFor("/markets/[id]").title };

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMarketId(id.toLowerCase())) redirect(withNote("/markets"));
  return <MarketsPage routeMarketId={toMarketId(id)} />;
}
