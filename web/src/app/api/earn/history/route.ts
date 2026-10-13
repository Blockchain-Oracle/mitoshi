// `GET /api/earn/history?reserve=maker|range|parlay|boost&range=7d|30d|all` (R6 money, S09; D-230): a reserve's
// share-price line from the ops `reserve-pricer`'s samples (`packages/db` reserve_prices), ≤ 300 points with the first
// and the last exact, plus when the reserve launched (its first sample, the deploy block's). Bigints travel as decimal
// strings. Public, on a short shared cache (the pricer samples every 10 minutes); 503 when the DB can't be read.
import { createPgReservePrices } from "@cwf/db";
import type { ReserveHistoryWire } from "@cwf/markets/earn";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";

const RESERVES = new Set(["maker", "range", "parlay", "boost"]);
const RANGES: Record<string, number | null> = { "7d": 7 * 86_400, "30d": 30 * 86_400, all: null };
const MAX_POINTS = 300;
const PUBLIC_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const reserve = q.get("reserve") ?? "maker";
  const range = q.get("range") ?? "all";
  if (!RESERVES.has(reserve)) return NextResponse.json({ error: "reserve must be maker, range, parlay or boost" }, { status: 400 });
  if (!(range in RANGES)) return NextResponse.json({ error: "range must be 7d, 30d or all" }, { status: 400 });
  try {
    const store = createPgReservePrices(db());
    const [oldest, newest] = await Promise.all([store.oldest(reserve), store.newest(reserve)]);
    const span = RANGES[range] ?? null;
    const since = span === null || !newest ? 0 : newest.atSec - span;
    const points = newest ? await store.series(reserve, since, MAX_POINTS) : [];
    const body: ReserveHistoryWire = {
      reserve: reserve as ReserveHistoryWire["reserve"],
      launchedAtSec: oldest?.atSec ?? null,
      latestAtSec: newest?.atSec ?? null,
      points: points.map((p) => ({ atSec: p.atSec, sharePriceRaw: p.sharePriceRaw.toString(), totalValueBase: p.totalValueBase.toString() })),
    };
    return NextResponse.json(body, { headers: { "cache-control": PUBLIC_CACHE } });
  } catch {
    return NextResponse.json({ error: "the history can't be read right now" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
