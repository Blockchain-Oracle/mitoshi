// `GET /api/games/arcade/tape` (R4-9, D-227): a real-price tape for the cabinets' attract loops — the same cut a run
// gets (`cutTape`), not stored and never rankable. Public, cached a few minutes; `points: []` when the index has none.
import { connection, NextResponse } from "next/server";
import { freshSeed } from "@/features/games/arcade/score.server";
import { cutTape } from "@/features/games/arcade/tape.server";

export async function GET() {
  await connection();
  try {
    const tape = await cutTape(freshSeed(), Math.floor(Date.now() / 1_000));
    return NextResponse.json(tape, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch {
    return NextResponse.json({ error: "the index did not answer" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
