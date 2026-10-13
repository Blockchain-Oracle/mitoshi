// `GET /api/games/achievements[?wallet=0x…]` (R4-9, D-227; Owarine 90a91d71): one wallet's badges. Nothing is signed for:
// every fact behind a badge is already public (the arcade board, the Lucky ladder).
import { connection, NextResponse } from "next/server";
import { achievementsFor } from "@/features/games/achievements.server";

export async function GET(req: Request) {
  await connection();
  const raw = new URL(req.url).searchParams.get("wallet");
  if (raw && !/^0x[0-9a-fA-F]{40}$/.test(raw)) return NextResponse.json({ error: "that is not an address" }, { status: 400 });
  try {
    return NextResponse.json(await achievementsFor(raw), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "the games store did not answer" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
