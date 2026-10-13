// `GET /api/games/arcade/runs?address=0x…` (R4-9, D-227): one wallet's replayed arcade runs, newest first, each with
// where its score ranks on its board now — the History page. Arcade rows are public product state (the board shows the
// same wallet and score); 400 without a valid address, `configured: false` when this deployment keeps no scores.
import { connection, NextResponse } from "next/server";
import { readRuns } from "@/features/games/arcade/score.server";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  await connection();
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "address must be a 0x address" }, { status: 400, headers: noStore });
  try {
    const rows = await readRuns(address, 50);
    return NextResponse.json({ configured: rows !== null, rows: rows ?? [] }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the history did not answer" }, { status: 503, headers: noStore });
  }
}
