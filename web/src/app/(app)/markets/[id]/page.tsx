// `/markets/<id>` opens that Window on the terminal (S23, D-192): `/trade?w=<id>` — the terminal finds the Window's
// ticker and moves there in place, and a settled Window resolves to its successor with a note (L-21, kept from the
// Agari 03b30ab render this replaces). A malformed id goes to the board with a note rather than throwing.
import { isMarketId } from "@cwf/core";
import { redirect } from "next/navigation";
import { withNote } from "@/lib/routes";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMarketId(id.toLowerCase())) redirect(withNote("/markets"));
  redirect(`/trade?w=${id.toLowerCase()}`);
}
