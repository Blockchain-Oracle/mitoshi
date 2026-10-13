// `GET /api/games/lucky/history?address=0x…` (R4-9, D-227; Masayume 68f7a09): a wallet's revealed draws, newest first.
import { connection, NextResponse } from "next/server";
import type { Address } from "@cwf/core";
import { readHistory } from "@/features/games/lucky/lucky.server";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request) {
  await connection();
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "address must be a 0x address" }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await readHistory(address as Address, new URL(req.url).origin), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "the draw server did not answer" }, { status: 503, headers: noStore });
  }
}
