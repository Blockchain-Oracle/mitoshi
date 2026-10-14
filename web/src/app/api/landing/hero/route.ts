// `GET /api/landing/hero` (R6 landing L01): the hero phone's Window, its pays and its line's last ten minutes — the
// same read the page seeds from (`hero.server.ts`), for the island to roll to the next Window at the cutoff and to
// refresh while it's on screen. Public product state, shared-cached for ten seconds.
import { connection, NextResponse } from "next/server";
import { heroData } from "@/features/landing/hero/hero.server";

const CACHE = { "cache-control": "public, max-age=5, s-maxage=10, stale-while-revalidate=30" };

export async function GET() {
  await connection();
  return NextResponse.json(await heroData(), { headers: CACHE });
}
