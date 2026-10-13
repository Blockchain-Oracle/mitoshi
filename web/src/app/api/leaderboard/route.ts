// `GET /api/leaderboard?period=day|week|month|all&sort=pnl|roi|streak[&you=0x…]` (S5, L-48): the ranked board for the
// terminal's leaderboard drawer (S23g, RV-86) and `/leaderboard`, from `features/leaderboard/board.server.ts`. Public,
// on a short shared cache (the board itself is recomputed every few minutes); 503 when the index can't be read.
import { NextResponse, type NextRequest } from "next/server";
import { PERIODS, readBoard, type BoardSort, type Period } from "@/features/leaderboard/board.server";

const PUBLIC_CACHE = "public, s-maxage=30, stale-while-revalidate=120";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const period = (q.get("period") ?? "week") as Period;
  const sort = (q.get("sort") ?? "pnl") as BoardSort;
  const you = q.get("you");
  if (!(period in PERIODS)) return NextResponse.json({ error: "period must be day, week, month or all" }, { status: 400 });
  if (sort !== "pnl" && sort !== "roi" && sort !== "streak") return NextResponse.json({ error: "sort must be pnl, roi or streak" }, { status: 400 });
  if (you !== null && !/^0x[0-9a-fA-F]{40}$/.test(you)) return NextResponse.json({ error: "you must be an address" }, { status: 400 });
  try {
    const board = await readBoard(period, sort, you ?? undefined);
    return NextResponse.json(board, { headers: { "cache-control": you ? "private, no-store" : PUBLIC_CACHE } });
  } catch {
    return NextResponse.json({ error: "the index can't be read right now" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
