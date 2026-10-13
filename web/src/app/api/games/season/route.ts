// `GET /api/games/season` (R4-9, D-227; Masayume 68f7a09 app/api/games/season): the operator's season and its escrow.
import { connection, NextResponse } from "next/server";
import { seasonView } from "@/features/games/duel/season.server";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await seasonView(), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the season could not be read" }, { status: 503, headers: noStore });
  }
}
