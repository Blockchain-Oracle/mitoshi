// `/markets/<id>` opens that Window in the markets hero (Owarine 90a91d71's `/markets/[id]`; O-3, D-222): the page's
// deep link `?m=<id>` selects it, and a settled Window resolves to its successor with a note (L-21). A malformed id
// goes to the board with a note rather than throwing.
import { isMarketId } from "@cwf/core";
import { redirect } from "next/navigation";
import { withNote } from "@/lib/routes";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMarketId(id.toLowerCase())) redirect(withNote("/markets"));
  redirect(`/markets?m=${id.toLowerCase()}`);
}
