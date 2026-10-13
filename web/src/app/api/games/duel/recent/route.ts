// `GET /api/games/duel/recent` (R6 games §5.2): the last decided duels, for Duel's floor before you play. Public, cached
// briefly.
import { connection, NextResponse } from "next/server";
import { duelRecent } from "@/features/games/duel/duel.server";

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await duelRecent(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
