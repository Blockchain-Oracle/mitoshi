import venueSpec from "@cwf/core/venue-spec.json";
import { latestSpot, parseGatewayJson, redstoneLatestUrl, toHex } from "@cwf/core/prices/redstone";
import { NextResponse, type NextRequest } from "next/server";

/**
 * A signed RedStone "latest" spot per feed, as the `RedStonePrintVerifier.verifySpot` wire payload (engine spec A.5.1,
 * A.5.4): the reserves' same-call PD-2 proof (Parlay `openParlay`, Range, Boost). The newest timestamp at which the
 * feed has at least the venue's threshold of distinct configured signers (`verifySpot` needs one timestamp across the
 * packages; an unconfigured signer would be refused `UnknownRedStoneSigner`). Only the venue's own feeds; never cached
 * (the guard refuses a spot older than its `maxSpotAgeSec`); one gateway fetch is shared for 1.5 s across requests.
 *   GET /api/prices/redstone-payload?feed=BTC,ETH → { spots: [{ feed, payload, tSec, signers, medianE8 }] }
 */

const FEEDS = new Set(venueSpec.series.map((s) => s.redstoneFeed).filter((f): f is string => typeof f === "string" && f.length > 0));
const SIGNERS = venueSpec.redstone.signers;
const THRESHOLD = venueSpec.redstone.threshold;
const SHARE_MS = 1_500;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_FEEDS = 4;
const NO_STORE = { "cache-control": "no-store" };

let shared: { atMs: number; text: Promise<string> } | null = null;

function gatewayText(nowMs: number): Promise<string> {
  if (shared && nowMs - shared.atMs < SHARE_MS) return shared.text;
  const text = fetch(redstoneLatestUrl(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    return res.text();
  });
  shared = { atMs: nowMs, text };
  text.catch(() => {
    if (shared?.text === text) shared = null;
  });
  return text;
}

export async function GET(request: NextRequest): Promise<Response> {
  const feeds = (request.nextUrl.searchParams.get("feed") ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  if (feeds.length === 0 || feeds.length > MAX_FEEDS) return NextResponse.json({ error: `name 1–${MAX_FEEDS} feeds` }, { status: 400, headers: NO_STORE });
  const unknown = feeds.filter((f) => !FEEDS.has(f));
  if (unknown.length > 0) return NextResponse.json({ error: `not a venue feed: ${unknown.join(", ")}` }, { status: 400, headers: NO_STORE });
  let all;
  try {
    all = parseGatewayJson(await gatewayText(Date.now()));
  } catch {
    return NextResponse.json({ error: "price-source-down" }, { status: 503, headers: NO_STORE });
  }
  const spots = [];
  for (const feed of feeds) {
    const spot = latestSpot(all, feed, THRESHOLD, SIGNERS);
    if (!spot) return NextResponse.json({ error: "no-signed-spot", feed }, { status: 503, headers: NO_STORE });
    spots.push({ feed, payload: toHex(spot.payload), tSec: Math.floor(spot.tMs / 1000), signers: spot.packages.length, medianE8: spot.medianE8.toString() });
  }
  return NextResponse.json({ spots }, { headers: NO_STORE });
}
