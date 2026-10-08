import { DATA_STREAMS_FEEDS, dataStreamsEnv, fetchLatestReport, fetchReportAt, v11Summary } from "@cwf/markets/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * A Chainlink Data Streams report for one venue symbol, as the `DataStreamsPrintVerifier` proof (`fullReport` bytes,
 * passed as is): the latest, or the one whose window contains `t` (windows are contiguous, so exactly one covers any
 * second). The sibling of `/api/prices/redstone-payload` (offchain C.3.7). The API key and secret stay on the server
 * (HMAC per request, `@cwf/markets` `datastreams.ts`); without them (Q-011, no subscription yet) the route says so —
 * never a made-up report.
 *   GET /api/prices/datastreams-report?symbol=TSLA[&t=<unix seconds>]
 *   → { symbol, feedId, validFromSec, observationsSec, fullReport, marketStatus? }
 */

const NO_STORE = { "cache-control": "no-store" };
const NETWORK = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

export async function GET(request: NextRequest): Promise<Response> {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const feedId = DATA_STREAMS_FEEDS[symbol];
  if (!feedId) return NextResponse.json({ error: "not-a-stream", symbol }, { status: 400, headers: NO_STORE });
  const tRaw = request.nextUrl.searchParams.get("t");
  const t = tRaw === null ? null : Number(tRaw);
  if (t !== null && (!Number.isSafeInteger(t) || t <= 0)) return NextResponse.json({ error: "t must be unix seconds" }, { status: 400, headers: NO_STORE });

  const ds = dataStreamsEnv(NETWORK);
  if (!ds) return NextResponse.json({ error: "datastreams-unconfigured", question: "Q-011" }, { status: 503, headers: NO_STORE });

  let answer;
  try {
    answer = t === null ? await fetchLatestReport(ds, feedId) : await fetchReportAt(ds, feedId, t);
  } catch {
    return NextResponse.json({ error: "price-source-down" }, { status: 503, headers: NO_STORE });
  }
  if (!answer.report) {
    const status = answer.status === 404 || answer.status === 200 ? 404 : 502;
    return NextResponse.json({ error: status === 404 ? "no-report" : "source-error", upstream: answer.status }, { status, headers: NO_STORE });
  }
  const { report } = answer;
  // v11 (equities) carries the session; the verifier proves it, this is for display and the caller's own checks.
  const summary = feedId.startsWith("0x000b") ? v11Summary(report.fullReport) : null;
  return NextResponse.json(
    {
      symbol,
      feedId,
      validFromSec: report.validFromSec,
      observationsSec: report.observationsSec,
      fullReport: report.fullReport,
      ...(summary ? { marketStatus: summary.marketStatus } : {}),
    },
    { headers: NO_STORE },
  );
}
