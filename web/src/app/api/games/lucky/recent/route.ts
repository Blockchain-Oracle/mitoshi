// `GET /api/games/lucky/recent` (R6 games §5.1): the latest draws across every wallet, for Lucky's floor before you
// play. Public, cached briefly; no reconcile on this read.
import { connection, NextResponse } from "next/server";
import { readRecentDraws } from "@/features/games/lucky/lucky.server";

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await readRecentDraws(), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ error: "the draw server did not answer" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
