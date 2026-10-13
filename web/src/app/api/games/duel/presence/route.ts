// `GET /api/games/duel/presence` (R4-9, D-227; Owarine 90a91d71 useRoomOccupancy's line): who waits at each pot now.
import { connection, NextResponse } from "next/server";
import { duelPresence } from "@/features/games/duel/duel.server";

const noStore = { "cache-control": "no-store" };

export async function GET() {
  await connection();
  try {
    return NextResponse.json(await duelPresence(), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: noStore });
  }
}
