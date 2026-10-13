// `GET /api/games/duel/history?address=0x…` (R4-9, D-227): a wallet's duels, newest first, as the arena last said.
import { connection, NextResponse } from "next/server";
import type { Address } from "@cwf/core";
import { readDuelHistory } from "@/features/games/duel/duel.server";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  await connection();
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "address must be a 0x address" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await readDuelHistory(address as Address), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the duel server did not answer" }, { status: 503, headers: noStore });
  }
}
