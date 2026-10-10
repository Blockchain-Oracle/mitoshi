// `GET /api/sentiment?symbol=TSLA` (S6, L-04; Agari 03b30ab's `/api/sentiment` per ticker): the crowd's lean beside the
// terminal's session cell — UP's share of demand lots over the last day (else the week), the house never counted.
// Public on a short shared cache; 400 for an unlisted ticker; 503 when the index can't be read.
import { isTickerSymbol } from "@cwf/core";
import { NextResponse, type NextRequest } from "next/server";
import { readCrowd } from "@/features/crowd/crowd.server";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!isTickerSymbol(symbol)) return NextResponse.json({ error: "symbol must be a listed ticker" }, { status: 400 });
  try {
    return NextResponse.json(await readCrowd(symbol), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ error: "the index can't be read right now" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
