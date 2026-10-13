// `GET /api/status` (P0, D-222): the overall verdict for the top bar's health chip (Owarine 90a91d71 `HealthChip`) and,
// since R4-10 (D-227), the whole report `/status` re-reads every 30 s. Read at request time from the same probes; held
// 30 s so the chip's and the board's polling stay cheap.
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { readStatus, type StatusReport } from "@/features/status/probes";

let held: { atMs: number; overall: string; report: StatusReport | null } | null = null;
const TTL_MS = 30_000;

export async function GET() {
  await connection();
  if (!held || Date.now() - held.atMs > TTL_MS) {
    const s = await readStatus().catch(() => null);
    held = { atMs: Date.now(), overall: s?.overall ?? "unreachable", report: s };
  }
  return NextResponse.json({ overall: held.overall, report: held.report }, { headers: { "cache-control": "no-store" } });
}
