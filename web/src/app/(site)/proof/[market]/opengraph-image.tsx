// A Window's link preview (S5, L-23/Y-14): its verdict and the closing print that decided it, read at request time.
import { connection } from "next/server";
import { OG_COPY } from "@/features/og/copy";
import { windowImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.window.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ market: string }> }) {
  await connection();
  return windowImage((await params).market);
}
