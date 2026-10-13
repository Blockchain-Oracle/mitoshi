// `GET /api/games/duel/board` (R4-9, D-227; Owarine 90a91d71 DuelRank's ladder): the Elo ladder over every decided duel.
import { connection, NextResponse } from "next/server";
import { duelStandings } from "@/features/games/duel/duel.server";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  await connection();
  try {
    const { configured, rows } = await duelStandings();
    return NextResponse.json({ configured, rows: rows.slice(0, 50) }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: noStore });
  }
}
