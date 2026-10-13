// `GET /api/games/arcade/board?game=…&address=…` (D-226): the top ten replayed runs on this engine build, the caller's
// best and rank, and a fresh eight-hex seed for the next run (Owarine 90a91d71 `readBoard`). `limit` (≤ 50) is the rank
// page's longer board (R4-9, D-227).
import { isArcadeGame } from "@cwf/core/games/arcade";
import { connection, NextResponse } from "next/server";
import { readBoard } from "@/features/games/arcade/score.server";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const game = url.searchParams.get("game") ?? "";
  if (!isArcadeGame(game)) return NextResponse.json({ error: "unknown game" }, { status: 400, headers: noStore });
  const address = url.searchParams.get("address");
  const valid = address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : null;
  try {
    const limit = Number(url.searchParams.get("limit") ?? "") || undefined;
    // `run=1` issues the next run's seed with its real-price tape (engine v2); a plain read only shows the board.
    return NextResponse.json(await readBoard(game, valid, limit, url.searchParams.get("run") === "1"), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the board did not answer" }, { status: 503, headers: noStore });
  }
}
