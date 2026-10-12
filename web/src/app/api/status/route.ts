// `GET /api/status` (P0, D-222): the overall verdict `/status` shows, for the top bar's health chip (Owarine 90a91d71
// `HealthChip`). Read at request time from the same probes; cached 30 s so the chip's polling stays cheap.
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { readStatus } from "@/features/status/probes";

let held: { atMs: number; overall: string } | null = null;
const TTL_MS = 30_000;

export async function GET() {
  await connection();
  if (!held || Date.now() - held.atMs > TTL_MS) {
    const s = await readStatus().catch(() => null);
    held = { atMs: Date.now(), overall: s?.overall ?? "unreachable" };
  }
  return NextResponse.json({ overall: held.overall }, { headers: { "cache-control": "no-store" } });
}
