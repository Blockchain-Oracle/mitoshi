// `GET /api/launch?token=0x…` and `GET /api/launch[?test=1]` (R6 money, S02 + S08; D-230): the launchpads from the index
// (`packages/db` index/0010, as /stats reads it). With a token: its facts, its last 500 trades and its holders in one
// answer — the token page's chart, tape and holders come from this one request, never a browser log scan. Without: the
// board, the team's QA launches left out unless `test=1`. Public, on a 2 s shared cache; 503 when the index can't be read.
import { NETWORKS, networkFrom, TEAM_LAUNCHERS } from "@cwf/core";
import { readLaunchBoard, readLaunchFeed, type LaunchSpecial } from "@cwf/db/idx";
import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { launchCursorKeys, launchOpsVenueOf } from "@cwf/markets/ops";
import { db } from "@/server/db";

const PUBLIC_CACHE = "public, s-maxage=2, stale-while-revalidate=10";

function special(): LaunchSpecial | null {
  const v = launchOpsVenueOf(NETWORKS[networkFrom(process.env.NETWORK)]);
  if (!v) return null;
  const keys = launchCursorKeys(v);
  return { curve: v.launchpad, pool: v.poolManager, locker: v.locker, cursors: [v.launchpad, v.registry, keys.transfers, keys.swaps] };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token = q.get("token");
  if (token !== null && !isAddress(token)) return NextResponse.json({ error: "token must be an address" }, { status: 400 });
  const s = special();
  if (!s) return NextResponse.json({ error: "not-deployed" }, { status: 404, headers: { "cache-control": PUBLIC_CACHE } });
  try {
    if (token) return NextResponse.json(await readLaunchFeed(db(), token, s), { headers: { "cache-control": PUBLIC_CACHE } });
    const network = networkFrom(process.env.NETWORK);
    const board = await readLaunchBoard(db(), { team: TEAM_LAUNCHERS[network], includeTeam: q.get("test") === "1", nowSec: Math.floor(Date.now() / 1000) }, s);
    return NextResponse.json(board, { headers: { "cache-control": PUBLIC_CACHE } });
  } catch {
    return NextResponse.json({ error: "the index can't be read right now" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
