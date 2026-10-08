// Ported from Owarine ecb7565b:web/src/app/api/version/route.ts — the build this server runs (stamped once per image
// build, `web/Dockerfile`); a page from an older build sees a different id and offers Refresh (Tradash's updater).
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? null }, { headers: { "cache-control": "no-store" } });
}
