// `GET /api/games/arcade/recent` (R4-9, D-227): the newest replayed arcade runs on any game, for the hall's now-playing
// marquee. Public product state (every board already shows wallet and score); empty when this deployment keeps no scores.
import { connection, NextResponse } from "next/server";
import { readRecentRuns } from "@/features/games/arcade/score.server";

const cache = { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" };

export async function GET() {
  await connection();
  try {
    const rows = await readRecentRuns(12);
    return NextResponse.json({ configured: rows !== null, rows: rows ?? [] }, { headers: cache });
  } catch {
    return NextResponse.json({ error: "the board did not answer" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
