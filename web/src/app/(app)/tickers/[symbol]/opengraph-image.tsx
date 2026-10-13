// A ticker hub's link preview (R4-13a, D-227; Owarine 90a91d71 `app/tickers/[symbol]/opengraph-image.tsx`): the terminal's
// card — the asset, "Up or Down?" and its last signed print — so a shared hub link no longer unfurls as the site card.
import { connection } from "next/server";
import { OG_COPY } from "@/features/og/copy";
import { tickerImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.ticker.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ symbol: string }> }) {
  await connection();
  return tickerImage((await params).symbol.toUpperCase());
}
