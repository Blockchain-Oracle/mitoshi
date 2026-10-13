// `GET /api/games/lucky/board` (R4-9, D-227; Masayume 68f7a09): the ladder of Lucky streaks over draws the chain settled.
import { connection, NextResponse } from "next/server";
import { readLuckyBoard } from "@/features/games/lucky/lucky.server";

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await readLuckyBoard(), { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ error: "the draw server did not answer" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
