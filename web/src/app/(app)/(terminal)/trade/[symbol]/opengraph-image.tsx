// A terminal's link preview (S5, L-23/Y-14): the asset, "Up or Down?" and its last signed print, read at request time.
import { connection } from "next/server";
import { OG_COPY } from "@/features/og/copy";
import { tickerImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.ticker.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ symbol: string }> }) {
  await connection();
  return tickerImage((await params).symbol);
}
