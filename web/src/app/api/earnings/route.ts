// `GET /api/earnings[?symbol=TSLA]` (S6; offchain spec C.3.9; Agari 03b30ab's route): the next reports for the listed
// stocks — from ops' `earnings` actor (Finnhub's calendar, read every 6 h, `/session.earnings`), so the web spends none
// of the shared Finnhub key. The answer covers today (ET) through `throughDateEt`, so an empty list is a real "no report
// before then"; a calendar ops can't vouch for is a 503, never an empty list.
import { addDays, EARNINGS_LOOKAHEAD_DAYS, etDateOf, isStockSymbol } from "@cwf/core";
import { cacheLife } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { parseSessionBody } from "@/features/markets/session/model";
import { webEnv } from "@/lib/env";

async function opsEarnings() {
  "use cache";
  cacheLife("minutes");
  const base = webEnv.markets.opsUrl;
  if (!base) throw new Error("no ops URL");
  const res = await fetch(`${base}/session`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`ops /session ${res.status}`);
  const body = parseSessionBody(await res.json());
  if (!body?.earnings) throw new Error("earnings unknown");
  return { events: body.earnings, nowSec: body.nowSec };
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (symbol !== null && !isStockSymbol(symbol)) return NextResponse.json({ error: "symbol must be a listed stock" }, { status: 400 });
  try {
    const { events, nowSec } = await opsEarnings();
    const today = etDateOf(nowSec);
    return NextResponse.json(
      { events: events.filter((e) => (symbol === null || e.symbol === symbol) && e.dateEt >= today), throughDateEt: addDays(today, EARNINGS_LOOKAHEAD_DAYS) },
      { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ error: "the earnings calendar can't be read right now" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
