// `/api/league?wallet=` (S13 step 11; D-195): a wallet's season — this week's points, where they came from, rank,
// percentile and league. Public, like the leaderboard it is computed from.
import { isAddress } from "viem";
import { connection } from "next/server";
import { readLeague } from "@/features/league/league.server";

export async function GET(req: Request): Promise<Response> {
  await connection();
  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) return Response.json({ error: "bad_wallet" }, { status: 400 });
  try {
    return Response.json(await readLeague(wallet), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
