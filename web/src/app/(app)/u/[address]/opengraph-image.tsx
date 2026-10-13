// A profile's link preview (R4-13a, D-227): the wallet's settled record from the index — its P&L, Windows settled, win
// rate and place on the board — read at request time within the preview budget; without the read it says what the
// page holds.
import { connection } from "next/server";
import { OG_COPY } from "@/features/og/copy";
import { profileImage } from "@/features/og/images";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/features/og/theme";

export const alt = OG_COPY.profile.alt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  await connection();
  return profileImage((await params).address);
}
